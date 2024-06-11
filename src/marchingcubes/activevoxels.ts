import activeVoxelsWGSL from '../shaders/active_voxels.wgsl?raw';
import { numPoints, workgroupCount } from './table';

export async function findActiveVoxels(
    device: GPUDevice,
    volumeTexture: GPUTexture,
    caseTable: GPUBuffer,
    counters: Uint32Array,
    markerBuffer: GPUBuffer,
) {
    const counterBuffer = device.createBuffer({
        size: 8,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const stagingBuffer = device.createBuffer({
        size: 8,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const activeVoxelsBindGroupLayout = device.createBindGroupLayout({
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

    const activeVoxelsBindGroup = device.createBindGroup({
        label: "Active Voxels Bind Group",
        layout: activeVoxelsBindGroupLayout,
        entries: [
            { binding: 0, resource: volumeTexture.createView() },
            { binding: 1, resource: { buffer: caseTable } },
            { binding: 2, resource: { buffer: stagingBuffer} },
            { binding: 3, resource: { buffer: markerBuffer} }
        ],
    });

    const activeVoxelsPipelineLayout = device.createPipelineLayout({
        label: "Active Voxels Pipeline Layout",
        bindGroupLayouts: [ activeVoxelsBindGroupLayout ],
    });

    const computeActiveVoxelsPipeline = device.createComputePipeline({
        label: "Active Voxels Pipeline",
        layout: activeVoxelsPipelineLayout,
        compute: {
            module: device.createShaderModule({
                code: activeVoxelsWGSL,
            }),
        },
    });

    const commandEncoder = device.createCommandEncoder();
    const activeVoxelsPass = commandEncoder.beginComputePass();
    activeVoxelsPass.setPipeline(computeActiveVoxelsPipeline);
    activeVoxelsPass.setBindGroup(0, activeVoxelsBindGroup);
    activeVoxelsPass.dispatchWorkgroups(workgroupCount, workgroupCount, workgroupCount);
    activeVoxelsPass.end();

    commandEncoder.copyBufferToBuffer(stagingBuffer, 0, counterBuffer, 0, 8);
    device.queue.submit([commandEncoder.finish()]);

    
    await counterBuffer.mapAsync(GPUMapMode.READ);
    const arr = new Uint32Array(counterBuffer.getMappedRange());
    counters[0] = arr[0];
    counters[1] = arr[1];
    counterBuffer.unmap();
}