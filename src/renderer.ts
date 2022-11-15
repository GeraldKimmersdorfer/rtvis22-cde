import vshader from './shaders/vertex.wgsl';
import fshader from './shaders/fragment.wgsl';

export const RenderTriangle = async () => {
    const canvas = document.getElementById("canvas-webgpu") as HTMLCanvasElement;
    const adapter = await navigator.gpu?.requestAdapter() as GPUAdapter;       
    const device = await adapter?.requestDevice() as GPUDevice;
    const context = canvas.getContext('webgpu') as GPUCanvasContext;
    const format = 'bgra8unorm';
    context.configure({
        device: device,
        format: format,
    });
    
    const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: device.createShaderModule({                    
                code: vshader
            }),
            entryPoint: "vs_main"
        },
        fragment: {
            module: device.createShaderModule({                    
                code: fshader
            }),
            entryPoint: "fs_main",
            targets: [{
                format: format
            }]
        },
        primitive:{
            topology: "triangle-list"
        } 
    });

    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();
    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: textureView,
            clearValue: { r: 0.2, g: 0.247, b: 0.314, a: 1.0 }, //background color
            loadOp: 'clear',
            storeOp: 'store'
        }]
    });
    renderPass.setPipeline(pipeline);
    renderPass.draw(3, 1, 0, 0);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
}