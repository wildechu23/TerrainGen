import renderMeshWGSL from "./shaders/render_mesh.wgsl?raw";

import { mat4, vec3 } from 'wgpu-matrix';
import { WASDCamera } from './camera/camera';
import { createInputHandler } from './camera/input';
import { Chunk, createChunk } from './chunk';
import { initUtils } from './marchingcubes/utils'

// TODO: GROUP UTIL TABLES INTO OWN GROUP BEFORE BINDING

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const inputHandler = createInputHandler(window, canvas);

const adapter = await navigator.gpu.requestAdapter();
const device = await adapter?.requestDevice()!;

const context = canvas.getContext('webgpu') as GPUCanvasContext;

const devicePixelRatio = window.devicePixelRatio;
canvas.width = canvas.clientWidth * devicePixelRatio;
canvas.height = canvas.clientHeight * devicePixelRatio;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
});

// init utils
initUtils(device);

// generate chunks
// let chunk = createChunk(device, vec3.create(0, 0, 0));

const numChunks = 4;
const chunks: Chunk[] = [];
for(let x = 0; x < numChunks; x++) {
  for(let y = 0; y < numChunks; y++) {
    for(let z = 0; z < numChunks; z++) {
      const coord = vec3.create(x, y, z);
      createChunk(device, coord).then(
        chunk => { if(chunk != null) chunks.push(chunk); }
      );
    }
  }
}


const uniformBufferSize = 80; // 4x4 matrix
const uniformBuffer = device.createBuffer({
  size: uniformBufferSize,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

let shaderModule = device.createShaderModule({
  code: renderMeshWGSL
});

// Vertex attribute state and shader stage
let vertexState = {
  // Shader stage info
  module: shaderModule,
  entryPoint: "vertex_main",
  // Vertex buffer info
  buffers: [{
      arrayStride: 4 * 4,
      attributes: [{
        format: "float32x4" as GPUVertexFormat, 
        offset: 0, 
        shaderLocation: 0
      }]
  }]
};

let fragmentState = {
  // Shader info
  module: shaderModule,
  entryPoint: "fragment_main",
  // Output render target info
  targets: [{format: presentationFormat}]
};

let bindGroupLayout = device.createBindGroupLayout({
  entries: [{binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {type: "uniform"}}]
});


// Create render pipeline
let layout = device.createPipelineLayout({bindGroupLayouts: [bindGroupLayout]});

let renderPipeline = device.createRenderPipeline({
  layout: layout,
  vertex: vertexState,
  fragment: fragmentState,
  primitive: {
    topology: 'triangle-list',
    frontFace: 'ccw',
    cullMode: 'back'
  },
  depthStencil: {
    depthWriteEnabled: true,
    depthCompare: 'less',
    format: 'depth24plus',
  },
});

const depthTexture = device.createTexture({
  size: [canvas.width, canvas.height],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

let renderPassDesc = {
  colorAttachments: [{
      view: null as unknown as GPUTextureView,
      loadOp: "clear" as GPULoadOp,
      clearValue: [0.3, 0.3, 0.3, 1],
      storeOp: "store" as GPUStoreOp
  }],
  depthStencilAttachment: {
    view: depthTexture.createView(),

    depthClearValue: 1.0,
    depthLoadOp: 'clear' as GPULoadOp,
    depthStoreOp: 'store' as GPUStoreOp,
  },
};

let bindGroup = device.createBindGroup({
  layout: bindGroupLayout,
  entries: [{binding: 0, resource: {buffer: uniformBuffer}}]
});


const camera = new WASDCamera({ 
  position: vec3.create(0, 0, 0),
  target: vec3.create(-2, 0, -2)
});

const aspect = canvas.width / canvas.height;
const projectionMatrix = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 100.0);
const modelViewProjectionMatrix = mat4.create();

function getModelViewProjectionMatrix(deltaTime: number) {
  const viewMatrix = camera.update(deltaTime, inputHandler());
  mat4.multiply(projectionMatrix, viewMatrix, modelViewProjectionMatrix);
  return modelViewProjectionMatrix as Float32Array;
}

let lastFrameMS = Date.now();
// let lastFPSMS = Date.now()

// main loop
function render() {
  const now = Date.now();
  const deltaTime = (now - lastFrameMS) / 1000;
  lastFrameMS = now;

  // if(now - lastFPSMS > 1000) {
  //   lastFPSMS = now;
  //   document.getElementById("fps")!.innerHTML = (1/deltaTime).toFixed(2);
  // }

  const modelViewProjection = getModelViewProjectionMatrix(deltaTime);
  device.queue.writeBuffer(
    uniformBuffer,
    0,
    modelViewProjection.buffer,
    modelViewProjection.byteOffset,
    modelViewProjection.byteLength
  );
  renderPassDesc.colorAttachments[0].view = context.getCurrentTexture().createView();
  
  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginRenderPass(renderPassDesc);
  passEncoder.setPipeline(renderPipeline);
  passEncoder.setBindGroup(0, bindGroup);

  for(var chunk of chunks) {
    passEncoder.setVertexBuffer(0, chunk.vertices);
    passEncoder.draw(chunk.vertices.size / 16);
  }

  passEncoder.end();
  device.queue.submit([commandEncoder.finish()]);

  requestAnimationFrame(render);
}

requestAnimationFrame(render);