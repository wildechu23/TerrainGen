import marchingCubesWGSL from '../shaders/marchingcubes.wgsl?raw';
import { Vec4 } from 'wgpu-matrix';

export async function createMarchingCubesVertices(
    device: GPUDevice, 
    volumeTexture: GPUTexture,
    markerBuffer: GPUBuffer,
    caseTable: GPUBuffer,
    vertices: GPUBuffer,
    coord: Vec4
) {
    // Buffer contains 1 vec4f
    const uniformBuffer: GPUBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    device.queue.writeBuffer(uniformBuffer, 0, coord as Float32Array);

    const counterBuffer: GPUBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    })

    // const stagingBuffer: GPUBuffer = device.createBuffer({
    //     size: vertices.size,
    //     usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    // })

    const marchingBindGroupLayout = device.createBindGroupLayout({
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
    
    const marchingBindGroup = device.createBindGroup({
        label: "Marching Cubes Bind Group",
        layout: marchingBindGroupLayout,
        entries: [
            { binding: 0, resource: volumeTexture.createView() },
            { binding: 1, resource: { buffer: markerBuffer} },
            { binding: 2, resource: { buffer: caseTable } },
            { binding: 3, resource: { buffer: vertices } },
            { binding: 4, resource: { buffer: uniformBuffer } },
            { binding: 5, resource: { buffer: counterBuffer }}
        ],
    });
    
    const marchingPipelineLayout = device.createPipelineLayout({
        label: "Marching Cubes Pipeline Layout",
        bindGroupLayouts: [ marchingBindGroupLayout ],
    });
    
    const computeMarchingPipeline = device.createComputePipeline({
        label: "Marching Cubes Pipeline",
        layout: marchingPipelineLayout,
        compute: {
            module: device.createShaderModule({
                code: marchingCubesWGSL,
            }),
        },
    });

    const linearWorkgroupSize = 32;
      
    const commandEncoder = device.createCommandEncoder();
    const marchingCubesPass = commandEncoder.beginComputePass();
    marchingCubesPass.setPipeline(computeMarchingPipeline);
    marchingCubesPass.setBindGroup(0, marchingBindGroup);
    marchingCubesPass.dispatchWorkgroups(Math.ceil(markerBuffer.size / linearWorkgroupSize));
    marchingCubesPass.end();
    
    // commandEncoder.copyBufferToBuffer(vertices, 0, stagingBuffer, 0, vertices.size);

    device.queue.submit([commandEncoder.finish()]);

    // await stagingBuffer.mapAsync(GPUMapMode.READ);
    // const arr = new Float32Array(stagingBuffer.getMappedRange());
    // console.log(arr);
    // stagingBuffer.unmap();
}