import vert_draw_shader from './shaders/vert_draw.wgsl';
import frag_draw_shader from './shaders/frag_draw.wgsl';
import comp_aggregate_shader from './shaders/comp_aggregate.wgsl';
import comp_average_shader from './shaders/comp_average.wgsl'
import { CreateGPUBuffer } from './helper'
import { UniformBuffer } from './rendering/buffer';
import { DB } from './db';


var _canvas:HTMLCanvasElement;
var _adapter:GPUAdapter;
var _device:GPUDevice;
var _context:GPUCanvasContext;

var _positionBuffer:GPUBuffer;
var _temperatureBuffer:GPUBuffer;
var _gridBuffer:GPUBuffer;
var _minmaxValueBuffer:GPUBuffer;
var _uniformBuffer:GPUBuffer;

var _drawPipeline:GPURenderPipeline;
var _aggregatePipeline:GPUComputePipeline;
var _averagePipeline:GPUComputePipeline;

var _drawBindGroup:GPUBindGroup;
var _aggregateBindGroup:GPUBindGroup;
var _averageBindGroup:GPUBindGroup;

var _initialised:boolean = false;

export var uniformBuffer:UniformBuffer = new UniformBuffer();

export const init = async () => {
    _canvas = document.getElementById("canvas-webgpu") as HTMLCanvasElement;
    _adapter = await navigator.gpu?.requestAdapter() as GPUAdapter;       
    _device = await _adapter?.requestDevice() as GPUDevice;
    _context = _canvas.getContext('webgpu', { alpha: false }) as unknown as GPUCanvasContext;
    const format:GPUTextureFormat = 'bgra8unorm';
    _context.configure({
        device: _device,
        format: format,
    });

    // Create Buffer
    uniformBuffer.refresh_db_properties(DB);
    _uniformBuffer = CreateGPUBuffer(_device, uniformBuffer.get_buffer(), GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    createGridBuffer();
    createPositionBuffer();
    createTemperatureBuffer();
    _minmaxValueBuffer = CreateGPUBuffer(_device, new ArrayBuffer(4 * 4), GPUBufferUsage.STORAGE);

    createPipelines(format);
    createBindGroups();

    _initialised = true;
}

const createGridBuffer = () => {
    uniformBuffer.set_screensize(_canvas.width, _canvas.height);
    let pointCount = uniformBuffer.get_pointcount();
    let grid = new Float32Array(pointCount * 4);
    _gridBuffer = CreateGPUBuffer(_device, grid.buffer, GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX);
}

const createPositionBuffer = () => {
    // EQUIRECTANGULAR PROJECTION (formulas taken from here: https://en.wikipedia.org/wiki/Equirectangular_projection)
    for (let i = 0; i < DB.positions.length; i++) {
        DB.positions[i]['x'] = (DB.positions[i]['lon'] + 180) * (1.0 / 360);
        DB.positions[i]['y'] = (DB.positions[i]['lat'] + 90) * (1.0 / 180);
    }

    const positionsArrayBuffer = new ArrayBuffer(DB.positions.length * 4 * 4);
    const pabView = new DataView(positionsArrayBuffer);
    for (let i = 0; i < DB.positions.length; i++) {
        pabView.setFloat32(i*16, DB.positions[i]['x'], true);
        pabView.setFloat32(i*16+4, DB.positions[i]['y'], true);
        pabView.setInt32(i*16+8, DB.positions[i]['id_min'], true);
        pabView.setInt32(i*16+12, DB.positions[i]['id_max'], true);
    }
    _positionBuffer = CreateGPUBuffer(_device, positionsArrayBuffer, GPUBufferUsage.STORAGE);
}

const createTemperatureBuffer = () => {
    const temperaturesArrayBuffer = new ArrayBuffer(DB.temperatures.length * 3 * 4);
    const tabView = new DataView(temperaturesArrayBuffer);
    for (let i = 0; i < DB.temperatures.length; i++) {
        tabView.setUint32(i*12, DB.temperatures[i].dm, true);
        tabView.setFloat32(i*12+4, DB.temperatures[i].avgt, true);
        tabView.setUint32(i*12+8, DB.temperatures[i].src, true);
    }
    _temperatureBuffer = CreateGPUBuffer(_device, temperaturesArrayBuffer, GPUBufferUsage.STORAGE);
}

const createPipelines = (format:GPUTextureFormat) => {
    _aggregatePipeline = _device.createComputePipeline({
        layout: "auto",
        compute: {
            module: _device.createShaderModule({                    
                code: comp_aggregate_shader
            }),
            entryPoint: "cs_main",
        }
    });

    _averagePipeline = _device.createComputePipeline({
        layout: "auto",
        compute: {
            module: _device.createShaderModule({
                code: comp_average_shader
            }),
            entryPoint: "cs_main"
        }
    });

    _drawPipeline = _device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: _device.createShaderModule({                    
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
            module: _device.createShaderModule({                    
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
}

const createBindGroups = () => {
    _aggregateBindGroup = _device.createBindGroup({
        layout: _aggregatePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: _uniformBuffer } },
            { binding: 1, resource: { buffer: _gridBuffer } },
            { binding: 2, resource: { buffer: _positionBuffer } },
            { binding: 3, resource: { buffer: _temperatureBuffer } }
        ]
    });

    _averageBindGroup = _device.createBindGroup({
        layout: _averagePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: _uniformBuffer } },
            { binding: 1, resource: { buffer: _gridBuffer } },
            { binding: 2, resource: { buffer: _minmaxValueBuffer } }
        ]
    });

	_drawBindGroup = _device.createBindGroup({
		layout: _drawPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: _uniformBuffer } },
            { binding: 1, resource: { buffer: _minmaxValueBuffer } }
		]
	});
}

export const renderFrame = async (recreateGridBuffer:boolean = false, recreatePositionBuffer:boolean = false, onlyDrawStage:boolean = false) => {
    if (!_initialised) return;

    if (recreateGridBuffer) {
        createGridBuffer();
    }
    if (recreatePositionBuffer) {
        createPositionBuffer();
    }
    if (recreateGridBuffer || recreatePositionBuffer) {
        createBindGroups();
    }

    // Update uniform buffer:
    _device.queue.writeBuffer(_uniformBuffer, 0, uniformBuffer.get_buffer());
    let pointCount = uniformBuffer.get_pointcount();

    var commandEncoder:GPUCommandEncoder;
    if (!onlyDrawStage) {
        commandEncoder = _device.createCommandEncoder();
        const aggregatePass = commandEncoder.beginComputePass();
        aggregatePass.setPipeline(_aggregatePipeline);
        aggregatePass.setBindGroup(0, _aggregateBindGroup);
        aggregatePass.dispatchWorkgroups(Math.ceil(pointCount / 64));
        aggregatePass.end();
        
        var start = Date.now();
        _device.queue.submit([commandEncoder.finish()]);
        await _device.queue.onSubmittedWorkDone();
        console.log(`Aggregation finished after ${Date.now() - start} ms`);
    
        commandEncoder = _device.createCommandEncoder();
        const avgPass = commandEncoder.beginComputePass();
        avgPass.setPipeline(_averagePipeline);
        avgPass.setBindGroup(0, _averageBindGroup);
        avgPass.dispatchWorkgroups(1);
        avgPass.end();
    
        start = Date.now();
        _device.queue.submit([commandEncoder.finish()]);
        await _device.queue.onSubmittedWorkDone();
        console.log(`Averaging finished after ${Date.now() - start} ms`);
    }
    
    commandEncoder = _device.createCommandEncoder();
    const textureView = _context.getCurrentTexture().createView();
    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: textureView,
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }, //background color
            loadOp: 'clear',
            storeOp: 'store'
        }]
    });
    renderPass.setPipeline(_drawPipeline);
    renderPass.setBindGroup(0, _drawBindGroup);
    renderPass.setVertexBuffer(0, _gridBuffer);
    renderPass.draw(6, pointCount);
    renderPass.end();
        
    start = Date.now();
    _device.queue.submit([commandEncoder.finish()]);
    await _device.queue.onSubmittedWorkDone();
    console.log(`Rendering finished after ${Date.now() - start} ms`);

}