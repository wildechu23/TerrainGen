import densityWGSL from './shaders/density.wgsl?raw';
import activeVoxelsWGSL from './shaders/active_voxels.wgsl?raw';
import marchingCubesWGSL from './shaders/marchingcubes.wgsl?raw';

import { Vec3 } from 'wgpu-matrix';

import { constants, constantsWGSL, raydirsWGSL } from './constants';
import { caseTable, vertTable } from './utils';
import { noiseTextures } from './noise';

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
}

let nearestRepeatSampler: GPUSampler;
let nearestClampSampler: GPUSampler;
let linearRepeatSampler: GPUSampler;
let linearClampSampler: GPUSampler;
let noiseBindGroupLayout: GPUBindGroupLayout;

let densityShader;
let densityBindGroupLayout: GPUBindGroupLayout;
let densityPipelineLayout: GPUPipelineLayout;
let computeDensityPipeline: GPUComputePipeline;

let activeVoxelsShader;
let activeVoxelsBindGroupLayout: GPUBindGroupLayout;
let activeVoxelsPipelineLayout: GPUPipelineLayout;
let computeActiveVoxelsPipeline: GPUComputePipeline;

let marchingCubesShader;
let marchingBindGroupLayout: GPUBindGroupLayout;
let marchingPipelineLayout: GPUPipelineLayout;
let computeMarchingPipeline: GPUComputePipeline;


const workgroupCount = constants.voxelDim / 4;

// 16 points per axis
// 15 voxels per axis

export function initChunk(device: GPUDevice) {
    // Shaders
    densityShader = device.createShaderModule({
        code: densityWGSL,
    });

    activeVoxelsShader = device.createShaderModule({
        code: constantsWGSL + activeVoxelsWGSL,
    });

    marchingCubesShader = device.createShaderModule({
        code: constantsWGSL + raydirsWGSL + marchingCubesWGSL,
    });

    // Samplers
    nearestRepeatSampler = device.createSampler({
        minFilter: 'nearest',
        magFilter: 'nearest',
        mipmapFilter: 'nearest',
        addressModeU: 'repeat',
        addressModeV: 'repeat',
        addressModeW: 'repeat',
    });

    nearestClampSampler = device.createSampler({
        minFilter: 'nearest',
        magFilter: 'nearest',
        mipmapFilter: 'nearest',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
    });

    linearRepeatSampler = device.createSampler({
        minFilter: 'linear',
        magFilter: 'linear',
        mipmapFilter: 'linear',
        addressModeU: 'repeat',
        addressModeV: 'repeat',
        addressModeW: 'repeat',
    });

    linearClampSampler = device.createSampler({
        minFilter: 'linear',
        magFilter: 'linear',
        mipmapFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
    });

    // Noise
    noiseBindGroupLayout = device.createBindGroupLayout({
        label: "Noise Bind Group Layout",
        entries: [{
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
                sampleType: "float",
                viewDimension: "3d",
            },
        }, {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
                sampleType: "float",
                viewDimension: "3d",
            },
        }, {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
                sampleType: "float",
                viewDimension: "3d",
            },
        }, {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
                sampleType: "float",
                viewDimension: "3d",
            },
        }, {
            binding: 4,
            visibility: GPUShaderStage.COMPUTE,
            sampler: {
                type: 'filtering'
            }
        }, {
            binding: 5,
            visibility: GPUShaderStage.COMPUTE,
            sampler: {
                type: 'filtering'
            }
        },]
    })

    // Density
    densityBindGroupLayout = device.createBindGroupLayout({
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

    densityPipelineLayout = device.createPipelineLayout({
        label: "Density Pipeline Layout",
        bindGroupLayouts: [
            densityBindGroupLayout,
            noiseBindGroupLayout,
        ],
    });


    computeDensityPipeline = device.createComputePipeline({
        label: "Density Pipeline",
        layout: densityPipelineLayout,
        compute: {
            module: densityShader,
        },
    });

    // Active Voxels
    activeVoxelsBindGroupLayout = device.createBindGroupLayout({
        label: "Active Voxels Bind Group Layout",
        entries: [{
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
                sampleType: "float",
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


    activeVoxelsPipelineLayout = device.createPipelineLayout({
        label: "Active Voxels Pipeline Layout",
        bindGroupLayouts: [activeVoxelsBindGroupLayout],
    });

    computeActiveVoxelsPipeline = device.createComputePipeline({
        label: "Active Voxels Pipeline",
        layout: activeVoxelsPipelineLayout,
        compute: {
            module: activeVoxelsShader,
        },
    });


    // Marching Cubes
    marchingBindGroupLayout = device.createBindGroupLayout({
        label: "Marching Cubes Bind Group Layout",
        entries: [{
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
                viewDimension: "3d",
                sampleType: "float",
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
        }, {
            binding: 6,
            visibility: GPUShaderStage.COMPUTE,
            sampler: {
                type: 'filtering'
            }
        }, {
            binding: 7,
            visibility: GPUShaderStage.COMPUTE,
            sampler: {
                type: 'filtering'
            }
        }]
    });

    marchingPipelineLayout = device.createPipelineLayout({
        label: "Marching Cubes Pipeline Layout",
        bindGroupLayouts: [marchingBindGroupLayout],
    });

    computeMarchingPipeline = device.createComputePipeline({
        label: "Marching Cubes Pipeline",
        layout: marchingPipelineLayout,
        compute: {
            module: marchingCubesShader,
        },
    });
}

export async function createChunk(device: GPUDevice, coord: Vec3) {
    let volumeTexture = device.createTexture({
        size: [constants.voxelDim, constants.voxelDim, constants.voxelDim],
        format: "r32float",
        dimension: "3d",
        usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST,
    });

    const voxelMarkerBuffer: GPUBuffer = device.createBuffer({
        size: constants.voxelDimMinusOne * constants.voxelDimMinusOne * constants.voxelDimMinusOne * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    const gen: ChunkGen = {
        device: device,
        coord: coord,
        volumeTexture: volumeTexture,
        voxelMarkerBuffer: voxelMarkerBuffer,
        vertices: {} as GPUBuffer,
    };

    await createDensityTexture(gen);

    // counters[0]: index, counters[1]: numVerts
    let counters: Uint32Array = new Uint32Array(2);

    await findActiveVoxels(gen, counters);

    // no active voxels
    if (counters[0] == 0) {
        return null;
    }

    gen.vertices = device.createBuffer({
        // vec4(size 16) per vertex
        size: counters[1] * 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC
    });

    await createMarchingCubesVertices(gen, counters[0]);

    gen.volumeTexture.destroy();
    gen.voxelMarkerBuffer.destroy();

    const chunk: Chunk = { coord: coord, vertices: gen.vertices };
    // console.log(chunk.coord);
    return chunk;
}

async function createDensityTexture(gen: ChunkGen) {
    const uniformBuffer: GPUBuffer = gen.device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    gen.device.queue.writeBuffer(uniformBuffer, 0, gen.coord as Float32Array);

    let densityTexture = gen.device.createTexture({
        size: [constants.voxelDim, constants.voxelDim, constants.voxelDim],
        format: "r32float",
        dimension: "3d",
        usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.COPY_SRC,
    });

    const densityBindGroup = gen.device.createBindGroup({
        label: "Density Bind Group",
        layout: densityBindGroupLayout,
        entries: [
            { binding: 0, resource: densityTexture.createView() },
            { binding: 1, resource: { buffer: uniformBuffer } }
        ],
    });

    const noiseBindGroup = gen.device.createBindGroup({
        label: "Noise Bind Group",
        layout: noiseBindGroupLayout,
        entries: [
            { binding: 0, resource: noiseTextures[0].createView() },
            { binding: 1, resource: noiseTextures[1].createView() },
            { binding: 2, resource: noiseTextures[2].createView() },
            { binding: 3, resource: noiseTextures[3].createView() },
            { binding: 4, resource: nearestRepeatSampler },
            { binding: 5, resource: linearRepeatSampler },
        ],
    });


    const commandEncoder = gen.device.createCommandEncoder();
    const densityPass = commandEncoder.beginComputePass();
    densityPass.setPipeline(computeDensityPipeline);
    densityPass.setBindGroup(0, densityBindGroup);
    densityPass.setBindGroup(1, noiseBindGroup);
    densityPass.dispatchWorkgroups(2, 2, workgroupCount);
    densityPass.end();

    commandEncoder.copyTextureToTexture(
        { texture: densityTexture },
        { texture: gen.volumeTexture },
        {
            width: constants.voxelDim,
            height: constants.voxelDim,
            depthOrArrayLayers: constants.voxelDim,
        },
    );
    gen.device.queue.submit([commandEncoder.finish()]);
}

async function findActiveVoxels(gen: ChunkGen, counters: Uint32Array) {
    const stagingBuffer = gen.device.createBuffer({
        size: 8,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    const counterBuffer = gen.device.createBuffer({
        size: 8,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    /*
        Bind Group:
        - 0: densityTexture
        - 1: vertices count table
        - 2: staging buffer for counters
        - 3: marker buffer
    */
    const activeVoxelsBindGroup = gen.device.createBindGroup({
        label: "Active Voxels Bind Group",
        layout: activeVoxelsBindGroupLayout,
        entries: [
            { binding: 0, resource: gen.volumeTexture.createView() },
            { binding: 1, resource: { buffer: vertTable } },
            { binding: 2, resource: { buffer: stagingBuffer } },
            { binding: 3, resource: { buffer: gen.voxelMarkerBuffer } }
        ],
    });


    const commandEncoder = gen.device.createCommandEncoder();
    const activeVoxelsPass = commandEncoder.beginComputePass();
    activeVoxelsPass.setPipeline(computeActiveVoxelsPipeline);
    activeVoxelsPass.setBindGroup(0, activeVoxelsBindGroup);
    activeVoxelsPass.dispatchWorkgroups(2, 2, workgroupCount);
    activeVoxelsPass.end();

    commandEncoder.copyBufferToBuffer(stagingBuffer, 0, counterBuffer, 0, 8);
    gen.device.queue.submit([commandEncoder.finish()]);
    
    // TODO: WHY DOES THIS UNMAP TAKE 500 MS
    counterBuffer.mapAsync(GPUMapMode.READ);
    await gen.device.queue.onSubmittedWorkDone();


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

    const readBuffer: GPUBuffer = gen.device.createBuffer({
        size: gen.vertices.size,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    })

    /*
        Bind group:
        - 0: densityTexture
        - 1: marker buffer
        - 2: case table
        - 3: vertices buffer
        - 4: uniform buffer (voxel offset)
        - 5: counter buffer 
    */
    const marchingBindGroup = gen.device.createBindGroup({
        label: "Marching Cubes Bind Group",
        layout: marchingBindGroupLayout,
        entries: [
            { binding: 0, resource: gen.volumeTexture.createView() },
            { binding: 1, resource: { buffer: gen.voxelMarkerBuffer } },
            { binding: 2, resource: { buffer: caseTable } },
            { binding: 3, resource: { buffer: gen.vertices } },
            { binding: 4, resource: { buffer: uniformBuffer } },
            { binding: 5, resource: { buffer: counterBuffer } },
            { binding: 6, resource: linearClampSampler },
            { binding: 7, resource: nearestClampSampler },
        ],
    });

    const linearWorkgroupSize = 32;

    const commandEncoder = gen.device.createCommandEncoder();
    const marchingCubesPass = commandEncoder.beginComputePass();
    marchingCubesPass.setPipeline(computeMarchingPipeline);
    marchingCubesPass.setBindGroup(0, marchingBindGroup);
    marchingCubesPass.dispatchWorkgroups(Math.ceil(numMarkers / linearWorkgroupSize));
    marchingCubesPass.end();

    commandEncoder.copyBufferToBuffer(gen.vertices, 0, readBuffer, 0, gen.vertices.size);

    gen.device.queue.submit([commandEncoder.finish()]);

    await gen.device.queue.onSubmittedWorkDone();

    await readBuffer.mapAsync(GPUMapMode.READ);
    const arr = new Float32Array(readBuffer.getMappedRange());
    const arr2 = Array.from(arr);
    console.log(arr2);
    readBuffer.unmap(); 
}

