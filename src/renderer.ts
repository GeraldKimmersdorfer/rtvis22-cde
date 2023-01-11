import vert_map_shader from './shaders/vert_map.wgsl';
import frag_map_shader from './shaders/frag_map.wgsl';
import vert_grid_shader from './shaders/vert_grid.wgsl';
import frag_grid_shader from './shaders/frag_grid.wgsl';
import comp_aggregate_shader from './shaders/comp_aggregate.wgsl';
import comp_average_shader from './shaders/comp_average.wgsl'

import * as geoJsonCoords from '@mapbox/geojson-coords';
import { Delaunay } from 'd3-delaunay';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { createEmptyGPUBuffer, createGpuBuffer } from './helper'
import { GridBuffer, UniformBuffer } from './rendering/buffer';
import { DB } from './db';
import * as ui from './ui';
import { TH } from './ui';

import geoJsonData from './assets/world.geojson';


var _canvas: HTMLCanvasElement;
var _adapter: GPUAdapter;
var _device: GPUDevice;
var _context: GPUCanvasContext;

var _positionBuffer: GPUBuffer;
var _temperatureBuffer: GPUBuffer;
var _gridBuffer: GPUBuffer;
var _gridReadBuffer: GPUBuffer;
var _minmaxValueBuffer: GPUBuffer;
var _uniformBuffer: GPUBuffer;
var _mapIndexBuffer: GPUBuffer;
var _mapVertexBuffer: GPUBuffer;

var _drawMapPipeline: GPURenderPipeline;
var _drawGridPipeline: GPURenderPipeline;
var _aggregatePipeline: GPUComputePipeline;
var _averagePipeline: GPUComputePipeline;

var _drawMapBindGroup: GPUBindGroup;
var _drawGridBindGroup: GPUBindGroup;
var _aggregateBindGroup: GPUBindGroup;
var _averageBindGroup: GPUBindGroup;

var _initialised: boolean = false;
var _mapTriangleCount: number;

export var uniformBuffer: UniformBuffer = new UniformBuffer();
export var gridBuffer: GridBuffer = new GridBuffer();

export const init = async () => {
    _canvas = document.getElementById("canvas-webgpu") as HTMLCanvasElement;
    _adapter = await navigator.gpu?.requestAdapter() as GPUAdapter;
    _device = await _adapter?.requestDevice() as GPUDevice;
    _context = _canvas.getContext('webgpu', { alpha: false }) as unknown as GPUCanvasContext;
    const format: GPUTextureFormat = 'bgra8unorm';
    _context.configure({
        device: _device,
        format: format,
    });

    const { points, triangles } = initGeography();
    _mapTriangleCount = triangles.length;

    // Create Buffer
    uniformBuffer.refresh_db_properties(DB);
    _uniformBuffer = createGpuBuffer(_device, uniformBuffer.get_buffer(), Uint8Array, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    createMapBuffers(points, triangles);
    createGridBuffer();
    createPositionBuffer();
    createTemperatureBuffer();
    _minmaxValueBuffer = createEmptyGPUBuffer(_device, 4 * 4, GPUBufferUsage.STORAGE);

    createPipelines(format);
    createBindGroups();

    _initialised = true;
}

const initGeography = () => {
    const geoData = geoJsonCoords(geoJsonData);
    const delaunay = Delaunay.from(geoData);

    const points: number[] = [];
    for (let i = 0; i < delaunay.points.length; i += 2) {
        points.push(delaunay.points[i] / 180.0); // longitude
        points.push(delaunay.points[i + 1] / 90.0); // latitude
    }

    const triangles: number[] = [];
    for (let i = 0; i < delaunay.triangles.length; i += 3) {
        const t0 = delaunay.triangles[i];
        const t1 = delaunay.triangles[i + 1];
        const t2 = delaunay.triangles[i + 2];
        const centerX = (delaunay.points[t0 * 2] + delaunay.points[t1 * 2] + delaunay.points[t2 * 2]) / 3.0;
        const centerY = (delaunay.points[t0 * 2 + 1] + delaunay.points[t1 * 2 + 1] + delaunay.points[t2 * 2 + 1]) / 3.0;
        const point = [centerX, centerY];
        if (geoJsonData.features.some((feature: any) => booleanPointInPolygon(point, feature))) {
            triangles.push(t0, t1, t2);
        }
    }

    return {
        points,
        triangles
    };
}

const createMapBuffers = (points: number[], triangles: number[]) => {
    _mapIndexBuffer = createGpuBuffer(_device, triangles, Uint32Array, GPUBufferUsage.INDEX);
    _mapVertexBuffer = createGpuBuffer(_device, points, Float32Array, GPUBufferUsage.VERTEX);
}

const createGridBuffer = () => {
    uniformBuffer.set_screensize(_canvas.width, _canvas.height);
    let pointCount = uniformBuffer.get_pointcount();
    _gridBuffer = createEmptyGPUBuffer(_device, pointCount * 4 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC);
}

const createGridReadBuffer = () => {
    let pointCount = uniformBuffer.get_pointcount();
    _gridReadBuffer = createEmptyGPUBuffer(_device, _gridBuffer.size, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
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
        pabView.setFloat32(i * 16, DB.positions[i]['x'], true);
        pabView.setFloat32(i * 16 + 4, DB.positions[i]['y'], true);
        pabView.setInt32(i * 16 + 8, DB.positions[i]['id_min'], true);
        pabView.setInt32(i * 16 + 12, DB.positions[i]['id_max'], true);
    }
    _positionBuffer = createGpuBuffer(_device, positionsArrayBuffer, Uint8Array, GPUBufferUsage.STORAGE);
}

const createTemperatureBuffer = () => {
    const temperaturesArrayBuffer = new ArrayBuffer(DB.temperatures.length * 3 * 4);
    const tabView = new DataView(temperaturesArrayBuffer);
    for (let i = 0; i < DB.temperatures.length; i++) {
        tabView.setUint32(i * 12, DB.temperatures[i].dm, true);
        tabView.setFloat32(i * 12 + 4, DB.temperatures[i].avgt, true);
        tabView.setUint32(i * 12 + 8, DB.temperatures[i].src, true);
    }
    _temperatureBuffer = createGpuBuffer(_device, temperaturesArrayBuffer, Uint8Array, GPUBufferUsage.STORAGE);
}

const createPipelines = (format: GPUTextureFormat) => {
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

    _drawMapPipeline = _device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: _device.createShaderModule({
                code: vert_map_shader
            }),
            entryPoint: "vs_main",
            buffers: [
                {
                    arrayStride: 4 * 2,
                    attributes: [
                        {
                            shaderLocation: 0,
                            format: "float32x2",
                            offset: 0
                        }
                    ]
                }
            ]
        },

        fragment: {
            module: _device.createShaderModule({
                code: frag_map_shader
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
            }]
        },
        primitive: {
            topology: "triangle-list"
        }
    });

    _drawGridPipeline = _device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: _device.createShaderModule({
                code: vert_grid_shader
            }),
            entryPoint: "vs_main"
        },
        fragment: {
            module: _device.createShaderModule({
                code: frag_grid_shader
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
        primitive: {
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

    _drawMapBindGroup = _device.createBindGroup({
        layout: _drawMapPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: _uniformBuffer } },
        ]
    });

    _drawGridBindGroup = _device.createBindGroup({
        layout: _drawGridPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: _uniformBuffer } },
            { binding: 1, resource: { buffer: _gridBuffer } },
            { binding: 2, resource: { buffer: _minmaxValueBuffer } }
        ]
    });
}

export const renderFrame = async (recreateGridBuffer: boolean = false, recreatePositionBuffer: boolean = false, onlyDrawStage: boolean = false, readBackGridBuffer: boolean = false) => {
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

    var commandEncoder: GPUCommandEncoder;
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
        TH.pushTime("agg", Date.now() - start);

        commandEncoder = _device.createCommandEncoder();
        const avgPass = commandEncoder.beginComputePass();
        avgPass.setPipeline(_averagePipeline);
        avgPass.setBindGroup(0, _averageBindGroup);
        avgPass.dispatchWorkgroups(1);
        avgPass.end();

        start = Date.now();
        _device.queue.submit([commandEncoder.finish()]);
        await _device.queue.onSubmittedWorkDone();
        TH.pushTime("avg", Date.now() - start);
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

    renderPass.setPipeline(_drawMapPipeline);
    renderPass.setBindGroup(0, _drawMapBindGroup);
    renderPass.setVertexBuffer(0, _mapVertexBuffer);
    renderPass.setIndexBuffer(_mapIndexBuffer, 'uint32');
    renderPass.drawIndexed(_mapTriangleCount);

    renderPass.setPipeline(_drawGridPipeline);
    renderPass.setBindGroup(0, _drawGridBindGroup);
    renderPass.draw(6, pointCount);
    renderPass.end();

    start = Date.now();
    _device.queue.submit([commandEncoder.finish()]);
    await _device.queue.onSubmittedWorkDone();
    TH.pushTime("rend", Date.now() - start);


    if (readBackGridBuffer || recreateGridBuffer) {
        // Create readback buffer:
        createGridReadBuffer();

        commandEncoder = _device.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(_gridBuffer, 0, _gridReadBuffer, 0, _gridReadBuffer.size);
        _device.queue.submit([commandEncoder.finish()]);
        start = Date.now();
        await _gridReadBuffer.mapAsync(GPUMapMode.READ);
        TH.pushTime("wback", Date.now() - start);
        const copyArrayBuffer: ArrayBuffer = _gridReadBuffer.getMappedRange();
        gridBuffer.from_buffer(copyArrayBuffer);
        ui.refreshGraphInformation(gridBuffer);
    }

}

