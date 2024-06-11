import densityWGSL from '../shaders/density.wgsl?raw';
import { Vec4 } from 'wgpu-matrix';
import { numPoints, workgroupCount } from './table';


export async function createDensityTexture(
    device: GPUDevice, 
    volumeTexture: GPUTexture, 
    coord: Vec4
) {
    const uniformBuffer: GPUBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    device.queue.writeBuffer(uniformBuffer, 0, coord as Float32Array);

    let densityTexture = device.createTexture({
        size: [numPoints, numPoints, numPoints],
        format: "r32float",
        dimension: "3d",
        usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });

    const densityBindGroupLayout = device.createBindGroupLayout({
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

    const densityBindGroup = device.createBindGroup({
        label: "Density Bind Group",
        layout: densityBindGroupLayout,
        entries: [
          { binding: 0, resource: densityTexture.createView() },
          { binding: 1, resource: { buffer: uniformBuffer } }
        ],
    });

    
    const densityPipelineLayout = device.createPipelineLayout({
        label: "Density Pipeline Layout",
        bindGroupLayouts: [ densityBindGroupLayout ],
    });
    
    
    const computeDensityPipeline = device.createComputePipeline({
        label: "Density Pipeline",
        layout: densityPipelineLayout,
        compute: {
        module: device.createShaderModule({
            code: densityWGSL,
        }),
        },
    }); 

    const commandEncoder = device.createCommandEncoder();
    const densityPass = commandEncoder.beginComputePass();
    densityPass.setPipeline(computeDensityPipeline);
    densityPass.setBindGroup(0, densityBindGroup);
    densityPass.dispatchWorkgroups(workgroupCount, workgroupCount, workgroupCount);
    densityPass.end();

    commandEncoder.copyTextureToTexture(
        {
          texture: densityTexture,
        },
        {
          texture: volumeTexture,
        },
        {
          width: numPoints,
          height: numPoints,
          depthOrArrayLayers: numPoints,
        },
    );
    device.queue.submit([commandEncoder.finish()]);
}