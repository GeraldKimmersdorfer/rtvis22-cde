import vshader from './shaders/vertex.wgsl';
import fshader from './shaders/fragment.wgsl';
import cshader from './shaders/compute.wgsl';
import { CreateGPUBuffer} from './helper'

export const RenderTriangle = async () => {
    const canvas = document.getElementById("canvas-webgpu") as HTMLCanvasElement;
    const adapter = await navigator.gpu?.requestAdapter() as GPUAdapter;       
    const device = await adapter?.requestDevice() as GPUDevice;
    const context = canvas.getContext('webgpu', { alpha: false }) as unknown as GPUCanvasContext;
    const format = 'bgra8unorm';
    context.configure({
        device: device,
        format: format,
    });

    let size = 0.1;
    let vs = 3.0/2.0 * size;
    let hs = Math.sqrt(3)*size;
    let x0 = hs / 2.0;

    let resolution = [Math.ceil(1.0 / hs) + 1, Math.ceil(1.0 / vs) + 1]
    let pointCount = resolution[0] * resolution[1];
    let middlePoints = new Float32Array(pointCount * 2);
    let values = new Float32Array(pointCount);

    for (let row = 0; row < resolution[1]; row++) {
        for (let col = 0; col < resolution[0]; col++) {
            let i = (row * resolution[0] + col) * 2;
            var x = x0 + col * hs;
            var y = row * vs;
            if (row % 2) {
            } else {
                x = col * hs; // even rows
            }
            middlePoints[i] = x;
            middlePoints[i+1] = y;
        }
    }
    console.log("Resolution: ", resolution);
    for (let i = 0; i < pointCount; i++) {
        values[i] = i / pointCount;
    }
    //middlePoints = new Float32Array(new Array(0.0, 0.0));

    const vertexBuffer = CreateGPUBuffer(device, middlePoints);
    const valuesBuffer = CreateGPUBuffer(device, values, GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX);

    // Create uniform buffer
    const uniformsBuffer = CreateGPUBuffer(device, new Float32Array([canvas.width, canvas.height, size, 0.0, resolution[0], resolution[1]]), GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    
    const renderPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: device.createShaderModule({                    
                code: vshader
            }),
            entryPoint: "vs_main",
            buffers:[
                {
                    arrayStride: 4 * 2,
                    stepMode: "instance",
                    attributes: [{
                        shaderLocation: 0,
                        format: "float32x2",
                        offset: 0
                    }
                    ]
                },
                {
                    arrayStride: 4 * 1,
                    stepMode: "instance",
                    attributes: [{
                        shaderLocation: 1,
                        format: "float32",
                        offset: 0
                    }
                    ]
                }
            ]
        },
        
        fragment: {
            module: device.createShaderModule({                    
                code: fshader
            }),
            entryPoint: "fs_main",
            targets: [{
                format: format,
                blend: {
                    color: {
                        srcFactor: 'src-alpha',
                        dstFactor: 'one-minus-src-alpha'
                    },
                    alpha: {
                        srcFactor: 'src-alpha',
                        dstFactor: 'one-minus-src-alpha'
                    }
                }
            }
            ]
        },
        primitive:{
            topology: "triangle-strip"
        }
    });

    // Create render bind group for shader
	const renderBindGroup = device.createBindGroup({
		layout: renderPipeline.getBindGroupLayout(0),
		entries: [
			{ // Uniforms buffer
				binding: 1,
				resource: {
					buffer: uniformsBuffer
				}
			}
		]
	});

    const computePipeline = device.createComputePipeline({
        layout: "auto",
        compute: {
            module: device.createShaderModule({                    
                code: cshader
            }),
            entryPoint: "cs_main",
        }
    });

    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();
    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: textureView,
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }, //background color
            loadOp: 'clear',
            storeOp: 'store'
        }]
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, renderBindGroup);
    renderPass.setVertexBuffer(0, vertexBuffer);
    renderPass.setVertexBuffer(1, valuesBuffer);
    renderPass.draw(6, middlePoints.length / 2.0);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
}