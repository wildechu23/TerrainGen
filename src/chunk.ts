import densityWGSL from './shaders/density.wgsl?raw';
import activeVoxelsWGSL from './shaders/active_voxels.wgsl?raw';
import marchingCubesWGSL from './shaders/marchingcubes.wgsl?raw';

import { Vec3 } from 'wgpu-matrix';

import { numPoints, workgroupCount } from './table';
import { caseTable, vertTable } from './utils';

export interface Chunk {
    coord: Vec3;
    vertices: GPUBuffer;
}

export interface ChunkGen {
    device: GPUDevice,
    coord: Vec3,
    volumeTexture: GPUTexture,
    voxelMarkerBuffer: GPUBuffer,
    vertices: GPUBuffer,
    querySet: GPUQuerySet,
    resolveBuffer: GPUBuffer,
    resultBuffer: GPUBuffer,
}

export async function createChunk(device: GPUDevice, coord: Vec3) {
    const querySet = device.createQuerySet({
        type: 'timestamp',
        count: 6,
    });
    const resolveBuffer = device.createBuffer({
        size: querySet.count * 8,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });

    const resultBuffer =  device.createBuffer({
        size: resolveBuffer.size,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    let volumeTexture = device.createTexture({
        size: [numPoints, numPoints, numPoints],
        format: "r32float",
        dimension: "3d",
        usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST,
    });

    const voxelMarkerBuffer: GPUBuffer = device.createBuffer({
        size: (numPoints * numPoints * numPoints) * 15 * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    const gen: ChunkGen = {
        device: device,
        coord: coord,
        volumeTexture: volumeTexture,
        voxelMarkerBuffer: voxelMarkerBuffer,
        vertices: {} as GPUBuffer,
        querySet: querySet,
        resolveBuffer: resolveBuffer,
        resultBuffer: resultBuffer,
    };

    await createDensityTexture(gen); 

    // counters[0]: index, counters[1]: numVerts
    let counters: Uint32Array = new Uint32Array(2);

    await findActiveVoxels(gen, counters);

    // Markers of the form z8y8x8_case8

    // TODO: Test whether 1 pass or 2 passes are faster
    //      - 1 pass: num_verts + vert_offsets (uses atomicAdd)
    //      - 2 pass: count active ( not 0 or 255) + voxel_offset, then vert_offsets

    // no active voxels
    if(counters[0] == 0) {
        return null;
    }
   
    gen.vertices = device.createBuffer({
        // vec4(size 16) per vertex
        size: counters[1] * 16, 
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC
    });
      
    await createMarchingCubesVertices(gen, counters[0]);

    const chunk: Chunk = {coord: coord, vertices: gen.vertices};
    return chunk;
}

async function createDensityTexture(gen: ChunkGen) {
    const uniformBuffer: GPUBuffer = gen.device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    gen.device.queue.writeBuffer(uniformBuffer, 0, gen.coord as Float32Array);

    let densityTexture = gen.device.createTexture({
        size: [numPoints, numPoints, numPoints],
        format: "r32float",
        dimension: "3d",
        usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });

    const densityBindGroupLayout = gen.device.createBindGroupLayout({
        label: "Density Bind Group Layout",
        entries: [{
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: {
                access: "write-only",
                format: "r32float",
                viewDimension: "3d",
            }
        }, {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {}
        }]
    });

    const densityBindGroup = gen.device.createBindGroup({
        label: "Density Bind Group",
        layout: densityBindGroupLayout,
        entries: [
          { binding: 0, resource: densityTexture.createView() },
          { binding: 1, resource: { buffer: uniformBuffer } }
        ],
    });

    
    const densityPipelineLayout = gen.device.createPipelineLayout({
        label: "Density Pipeline Layout",
        bindGroupLayouts: [ densityBindGroupLayout ],
    });
    
    
    const computeDensityPipeline = gen.device.createComputePipeline({
        label: "Density Pipeline",
        layout: densityPipelineLayout,
        compute: {
            module: gen.device.createShaderModule({
                code: densityWGSL,
            }),
        },
    }); 

    let computePassDesc = {
        timestampWrites: {
            querySet: gen.querySet,
            beginningOfPassWriteIndex: 0,
            endOfPassWriteIndex: 1,
        },
    };

    const commandEncoder = gen.device.createCommandEncoder();
    const densityPass = commandEncoder.beginComputePass(computePassDesc);
    densityPass.setPipeline(computeDensityPipeline);
    densityPass.setBindGroup(0, densityBindGroup);
    densityPass.dispatchWorkgroups(workgroupCount, workgroupCount, workgroupCount);
    densityPass.end();

    commandEncoder.copyTextureToTexture(
        { texture: densityTexture },
        { texture: gen.volumeTexture },
        {
          width: numPoints,
          height: numPoints,
          depthOrArrayLayers: numPoints,
        },
    );
    gen.device.queue.submit([commandEncoder.finish()]);
}

async function findActiveVoxels(gen: ChunkGen, counters: Uint32Array) {
    const counterBuffer = gen.device.createBuffer({
        size: 8,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const stagingBuffer = gen.device.createBuffer({
        size: 8,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const activeVoxelsBindGroupLayout = gen.device.createBindGroupLayout({
        label: "Active Voxels Bind Group Layout",
        entries: [{
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
                sampleType: "unfilterable-float",
                viewDimension: "3d",
            },
        }, {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
                type: "read-only-storage",
            }
        }, {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: "storage" }
        }, {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: "storage" }
        }]
    });

    const activeVoxelsBindGroup = gen.device.createBindGroup({
        label: "Active Voxels Bind Group",
        layout: activeVoxelsBindGroupLayout,
        entries: [
            { binding: 0, resource: gen.volumeTexture.createView() },
            { binding: 1, resource: { buffer: vertTable } },
            { binding: 2, resource: { buffer: stagingBuffer} },
            { binding: 3, resource: { buffer: gen.voxelMarkerBuffer} }
        ],
    });

    const activeVoxelsPipelineLayout = gen.device.createPipelineLayout({
        label: "Active Voxels Pipeline Layout",
        bindGroupLayouts: [ activeVoxelsBindGroupLayout ],
    });

    const computeActiveVoxelsPipeline = gen.device.createComputePipeline({
        label: "Active Voxels Pipeline",
        layout: activeVoxelsPipelineLayout,
        compute: {
            module: gen.device.createShaderModule({
                code: activeVoxelsWGSL,
            }),
        },
    });

    let computePassDesc = {
        timestampWrites: {
            querySet: gen.querySet,
            beginningOfPassWriteIndex: 2,
            endOfPassWriteIndex: 3,
        },
    };

    const commandEncoder = gen.device.createCommandEncoder();
    const activeVoxelsPass = commandEncoder.beginComputePass(computePassDesc);
    activeVoxelsPass.setPipeline(computeActiveVoxelsPipeline);
    activeVoxelsPass.setBindGroup(0, activeVoxelsBindGroup);
    activeVoxelsPass.dispatchWorkgroups(workgroupCount, workgroupCount, workgroupCount);
    activeVoxelsPass.end();

    commandEncoder.copyBufferToBuffer(stagingBuffer, 0, counterBuffer, 0, 8);
    gen.device.queue.submit([commandEncoder.finish()]);

    
    await counterBuffer.mapAsync(GPUMapMode.READ);
    const arr = new Uint32Array(counterBuffer.getMappedRange());
    counters[0] = arr[0];
    counters[1] = arr[1];
    counterBuffer.unmap();
}


async function createMarchingCubesVertices(gen: ChunkGen, numMarkers: number) {
    // Buffer contains 1 vec4f
    const uniformBuffer: GPUBuffer = gen.device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    gen.device.queue.writeBuffer(uniformBuffer, 0, gen.coord as Float32Array);

    const counterBuffer: GPUBuffer = gen.device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    })

    const marchingBindGroupLayout = gen.device.createBindGroupLayout({
        label: "Marching Cubes Bind Group Layout",
        entries: [{
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
                viewDimension: "3d",
                sampleType: "unfilterable-float",
            }
        }, {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
                type: "read-only-storage",
            }
        }, {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
                type: "read-only-storage",
            }
        }, {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
                type: "storage",
            }
        }, {
            binding: 4,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {}
        }, {
            binding: 5,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
                type: "storage"
            }
        }]
    });
    
    const marchingBindGroup = gen.device.createBindGroup({
        label: "Marching Cubes Bind Group",
        layout: marchingBindGroupLayout,
        entries: [
            { binding: 0, resource: gen.volumeTexture.createView() },
            { binding: 1, resource: { buffer: gen.voxelMarkerBuffer} },
            { binding: 2, resource: { buffer: caseTable } },
            { binding: 3, resource: { buffer: gen.vertices } },
            { binding: 4, resource: { buffer: uniformBuffer } },
            { binding: 5, resource: { buffer: counterBuffer }}
        ],
    });
    
    const marchingPipelineLayout = gen.device.createPipelineLayout({
        label: "Marching Cubes Pipeline Layout",
        bindGroupLayouts: [ marchingBindGroupLayout ],
    });
    
    const computeMarchingPipeline = gen.device.createComputePipeline({
        label: "Marching Cubes Pipeline",
        layout: marchingPipelineLayout,
        compute: {
            module: gen.device.createShaderModule({
                code: marchingCubesWGSL,
            }),
        },
    });

    let computePassDesc = {
        timestampWrites: {
            querySet: gen.querySet,
            beginningOfPassWriteIndex: 4,
            endOfPassWriteIndex: 5,
        },
    };

    const linearWorkgroupSize = 32;
      
    const commandEncoder = gen.device.createCommandEncoder();
    const marchingCubesPass = commandEncoder.beginComputePass(computePassDesc);
    marchingCubesPass.setPipeline(computeMarchingPipeline);
    marchingCubesPass.setBindGroup(0, marchingBindGroup);
    marchingCubesPass.dispatchWorkgroups(Math.ceil(numMarkers / linearWorkgroupSize));
    marchingCubesPass.end();
    
    commandEncoder.resolveQuerySet(gen.querySet, 0, gen.querySet.count, gen.resolveBuffer, 0);
    commandEncoder.copyBufferToBuffer(gen.resolveBuffer, 0, gen.resultBuffer, 0, gen.resultBuffer.size);

    gen.device.queue.submit([commandEncoder.finish()]);

    gen.resultBuffer.mapAsync(GPUMapMode.READ).then(() => {
        const times = new BigInt64Array(gen.resultBuffer.getMappedRange());
        let densityGPUTime = Number(times[1] - times[0]) / 1000000;
        let activeGPUTime = Number(times[3] - times[2]) / 1000000;
        let marchingGPUTime = Number(times[5] - times[4]) / 1000000;
        let totalGPUTime = densityGPUTime + activeGPUTime + marchingGPUTime;
        let totalTime = Number(times[5] - times[0]) / 1000000;
        // console.log(`${densityGPUTime} ms, ${activeGPUTime} ms, ${marchingGPUTime} ms`);
        // console.log(`${totalGPUTime} ms, ${totalTime}`);
        gen.resultBuffer.unmap();
    });
}

