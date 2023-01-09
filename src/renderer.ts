import vert_draw_shader from './shaders/vert_draw.wgsl';
import frag_draw_shader from './shaders/frag_draw.wgsl';
import comp_aggregate_shader from './shaders/comp_aggregate.wgsl';
import comp_average_shader from './shaders/comp_average.wgsl'
import { CreateGPUBuffer } from './helper'


var canvas:HTMLCanvasElement;
var adapter:GPUAdapter;
var device:GPUDevice;
var context:GPUCanvasContext;

var positionBuffer:GPUBuffer;
var temperatureBuffer:GPUBuffer;

var gridBuffer:GPUBuffer;
var minmaxValueBuffer:GPUBuffer;
var uniformBuffer:GPUBuffer;


export const init = async (db:any) => {

}

export const createGridBuffer = () => {

}

export const RenderTriangle = async (db:any) => {
    canvas = document.getElementById("canvas-webgpu") as HTMLCanvasElement;
    adapter = await navigator.gpu?.requestAdapter() as GPUAdapter;       
    device = await adapter?.requestDevice() as GPUDevice;
    context = canvas.getContext('webgpu', { alpha: false }) as unknown as GPUCanvasContext;
    const format = 'bgra8unorm';
    context.configure({
        device: device,
        format: format,
    });

    let pointSize = 0.01;

    let vs = 3.0 / 2.0 * pointSize;
    let hs = Math.sqrt(3) * pointSize;
    let x0 = hs / 2.0;
    let resolution = [Math.ceil(1.0 / hs) + 1, Math.ceil(1.0 / vs) + 1]
    let pointCount = resolution[0] * resolution[1];
    
    
    let grid = new Float32Array(pointCount * 4);
    gridBuffer = CreateGPUBuffer(device, grid.buffer, GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX);

    // Create uniform buffer
    const uniformArrayBuffer = new ArrayBuffer(24 * 4);
    const uabView = new DataView(uniformArrayBuffer);

    uabView.setFloat32(0, pointSize, true);
    uabView.setFloat32(4, vs, true);
    uabView.setFloat32(8, hs, true);
    uabView.setFloat32(12, 0.0, true);
    uabView.setUint32(16, canvas.width, true);
    uabView.setUint32(20, canvas.height, true);
    uabView.setUint32(24, resolution[0], true);
    uabView.setUint32(28, resolution[1], true);

    // COLOR: https://colorbrewer2.org/#type=diverging&scheme=RdBu&n=9
    uabView.setUint32(32, 1);   // color mode
    // colorA
    uabView.setFloat32(48, 33.0/255.0, true);
    uabView.setFloat32(52, 102.0/255.0, true);
    uabView.setFloat32(56, 172.0/255.0, true);
    uabView.setFloat32(60, 1.0, true);
    // colorB
    uabView.setFloat32(64, 255.0/255.0, true);
    uabView.setFloat32(68, 255.0/255.0, true);
    uabView.setFloat32(72, 255.0/255.0, true);
    uabView.setFloat32(76, 0.5, true);
    // colorC
    uabView.setFloat32(80, 178.0/255.0, true);
    uabView.setFloat32(84, 24.0/255.0, true);
    uabView.setFloat32(88, 43.0/255.0, true);
    uabView.setFloat32(92, 1.0, true);

    uniformBuffer = CreateGPUBuffer(device, uniformArrayBuffer, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);


    // Calculate projected points:
    let R = 1.0     //earth radius
    let mapwidth = 1.0
    let mapheight = 1.0
    for (let i = 0; i < db.positions.length; i++) {
        db.positions[i]['x'] = (db.positions[i]['lon'] + 180) * (mapwidth / 360);
        db.positions[i]['y'] = (db.positions[i]['lat'] + 90) * (mapheight / 180);
    }

    const positionsArrayBuffer = new ArrayBuffer(db.positions.length * 4 * 4);
    const pabView = new DataView(positionsArrayBuffer);
    for (let i = 0; i < db.positions.length; i++) {
        pabView.setFloat32(i*16, db.positions[i]['x'], true);
        pabView.setFloat32(i*16+4, db.positions[i]['y'], true);
        pabView.setInt32(i*16+8, db.positions[i]['id_min'], true);
        pabView.setInt32(i*16+12, db.positions[i]['id_max'], true);
    }
    positionBuffer = CreateGPUBuffer(device, positionsArrayBuffer, GPUBufferUsage.STORAGE);

    const temperaturesArrayBuffer = new ArrayBuffer(db.temperatures.length * 3 * 4);
    const tabView = new DataView(temperaturesArrayBuffer);
    for (let i = 0; i < db.temperatures.length; i++) {
        tabView.setUint32(i*12, db.temperatures[i].dm, true);
        tabView.setFloat32(i*12+4, db.temperatures[i].avgt, true);
        tabView.setUint32(i*12+8, db.temperatures[i].src, true);
    }
    temperatureBuffer = CreateGPUBuffer(device, temperaturesArrayBuffer, GPUBufferUsage.STORAGE);

    minmaxValueBuffer = CreateGPUBuffer(device, new ArrayBuffer(4 * 4), GPUBufferUsage.STORAGE);
    
    const renderPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: device.createShaderModule({                    
                code: vert_draw_shader
            }),
            entryPoint: "vs_main",
            buffers:[
                {
                    arrayStride: 4 * 4,
                    stepMode: "instance",
                    attributes: [{
                        shaderLocation: 0,
                        format: "float32x4",
                        offset: 0
                    }
                    ]
                }
            ]
        },
        
        fragment: {
            module: device.createShaderModule({                    
                code: frag_draw_shader
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

	const renderBindGroup = device.createBindGroup({
		layout: renderPipeline.getBindGroupLayout(0),
		entries: [
			{ // Uniforms buffer
				binding: 0,
				resource: {
					buffer: uniformBuffer
				}
			},
            {
                binding: 1,
                resource: {
                    buffer: minmaxValueBuffer
                }
            }
		]
	});

    const computeAggregatePipeline = device.createComputePipeline({
        layout: "auto",
        compute: {
            module: device.createShaderModule({                    
                code: comp_aggregate_shader
            }),
            entryPoint: "cs_main",
        }
    });

    const computeAggregateBindGroup = device.createBindGroup({
        layout: computeAggregatePipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffer
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: gridBuffer
                }
            },
            {
                binding: 2,
                resource: {
                    buffer: positionBuffer
                }
            },
            {
                binding: 3,
                resource: {
                    buffer: temperatureBuffer
                }
            }
        ]
    });

    const computeAveragePipeline = device.createComputePipeline({
        layout: "auto",
        compute: {
            module: device.createShaderModule({
                code: comp_average_shader
            }),
            entryPoint: "cs_main"
        }
    });

    const computeAverageBindGroup = device.createBindGroup({
        layout: computeAveragePipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffer
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: gridBuffer
                }
            },
            {
                binding: 2,
                resource: {
                    buffer: minmaxValueBuffer
                }
            }
        ]
    });

    var commandEncoder = device.createCommandEncoder();
    const aggregatePass = commandEncoder.beginComputePass();
    aggregatePass.setPipeline(computeAggregatePipeline);
    aggregatePass.setBindGroup(0, computeAggregateBindGroup);
    aggregatePass.dispatchWorkgroups(Math.ceil(pointCount / 64));
    aggregatePass.end();
    
    var start = Date.now();
    device.queue.submit([commandEncoder.finish()]);
    device.queue.onSubmittedWorkDone().then(val => {
        console.log(`Aggregation finished after ${Date.now() - start} ms`);

        commandEncoder = device.createCommandEncoder();
        const avgPass = commandEncoder.beginComputePass();
        avgPass.setPipeline(computeAveragePipeline);
        avgPass.setBindGroup(0, computeAverageBindGroup);
        avgPass.dispatchWorkgroups(1);
        avgPass.end();

        start = Date.now();
        device.queue.submit([commandEncoder.finish()]);
        device.queue.onSubmittedWorkDone().then(val => {
            console.log(`Averaging finished after ${Date.now() - start} ms`);

            commandEncoder = device.createCommandEncoder();
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
            renderPass.setVertexBuffer(0, gridBuffer);
            renderPass.draw(6, pointCount);
            renderPass.end();
        
            start = Date.now();
            device.queue.submit([commandEncoder.finish()]);
            device.queue.onSubmittedWorkDone().then(val => {
                console.log(`Rendering finished after ${Date.now() - start} ms`);
            });
        });
    });

}