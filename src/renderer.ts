
import rend_map_shader from './shaders/rend_map.wgsl';
import rend_grid_shader from './shaders/rend_grid.wgsl';
import comp_binning_shader from './shaders/comp_binning.wgsl';
import comp_aggregate_shader from './shaders/comp_aggregate.wgsl';
import comp_minmax_shader from './shaders/comp_minmax.wgsl';
import rend_points_shader from './shaders/rend_points.wgsl';

import * as geoJsonCoords from '@mapbox/geojson-coords';
import { Delaunay } from 'd3-delaunay';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { createEmptyGPUBuffer, createGpuBuffer, dec2bin, degrees_to_radians, discretize, freeGpuBuffer, getErrorMessage } from './helper'
import { GridBuffer, KdPositionBuffer, UniformBuffer } from './rendering/buffer';
import { Database, DB } from './db';
import * as ui from './ui';
import { TH } from './ui';

import geoJsonMap from './assets/map.geojson';
import geoJsonMapBoundries from './assets/map_boundries.geojson';
import { BlobOptions } from 'buffer';
import { projectPoint } from './projections';
import { Vec2_f32 } from './rendering/vectors';
import { buffer } from 'stream/consumers';

require('jquery-ui/ui/widgets/dialog');


var _canvas: HTMLCanvasElement;
var _adapter: GPUAdapter;
var _device: GPUDevice;
var _context: GPUCanvasContext;

var _querySet: GPUQuerySet;

var _positionBuffer: GPUBuffer;
var _temperatureBuffer: GPUBuffer;
var _gridBuffer: GPUBuffer;
var _workgroupBoundsBuffer: GPUBuffer;
var _gridReadBuffer: GPUBuffer;
var _minmaxValueBuffer: GPUBuffer;
var _uniformBuffer: GPUBuffer;
var _mapIndexBuffer: GPUBuffer;
var _mapVertexBuffer: GPUBuffer;
var _mapBoundriesIndexBuffer: GPUBuffer;
var _mapBoundriesVertexBuffer: GPUBuffer;
var _mapModelBuffer: GPUBuffer;
var _mapBoundriesModelBuffer: GPUBuffer;
var _kdPositionBuffer: GPUBuffer;
var _queryBuffer: GPUBuffer;
var _queryReadBuffer: GPUBuffer;

var _drawMapPipeline: GPURenderPipeline;
var _drawPointsPipeline: GPURenderPipeline;
var _drawGridPipeline: GPURenderPipeline;

var _aggregatePipeline: GPUComputePipeline;
var _binningPipeline: GPUComputePipeline;
var _minMaxPipeline: GPUComputePipeline;


var _drawMapBindGroup: GPUBindGroup;
var _drawMapBoundriesBindGroup: GPUBindGroup;
var _drawGridBindGroup: GPUBindGroup;
var _drawPointsBindGroup: GPUBindGroup;

var _aggregateBindGroup: GPUBindGroup;
var _binningBindGroup: GPUBindGroup;
var _minMaxBindGroup: GPUBindGroup;


var _initialised: boolean = false;
var _frameInFlight: boolean = false;
var _mapTriangleCount: number;
var _mapPoints: number[];   // lat lon original points of map
var _mapBoundriesTriangleCount: number;
var _mapBoundriesPoints: number[];

var _timestampQueriesEnabled: boolean = true;

const AGGREGATE_WORKGROUP_SIZE = 32; // dont forget to change in shader
const BINNING_WORKGROUP_SIZE = 32; // dont forget to change in shader
const MINMAX_WORKGROUP_SIZE = 32; // dont forget to change in shader

const QUERY_CAPACITY = 6; //Max number of timestamps we can store

export var uniformBuffer: UniformBuffer = new UniformBuffer();
export var gridBuffer: GridBuffer = new GridBuffer();
export var kdPositionBuffer: KdPositionBuffer = new KdPositionBuffer();

export var _benchmarkEnabled: boolean = false;
var _pointRendering:boolean = false;
export const setPointRenderingEnabled = (state:boolean) => { _pointRendering = state; }
export var colorsMap:any = {
    "water": [21/255, 121/255, 200/255, 0.3],
    "continents": [120/255,120/255, 120/255, 0.5]
}

export const init = async () => {
    const format: GPUTextureFormat = 'bgra8unorm';
    if (!_initialised) {
        _canvas = document.getElementById("canvas-webgpu") as HTMLCanvasElement;
        _adapter = await navigator.gpu?.requestAdapter() as GPUAdapter;
        try {
            _device = await _adapter?.requestDevice({
                requiredFeatures: ["timestamp-query"],
            }) as GPUDevice;
            ui.TH.setGroups([
                { name: "Aggregate", id: "agg", avgCount: 60},
                { name: "Binning", id: "bin", avgCount: 60},
                { name: "MinMax", id: "minmax", avgCount: 60},
                { name: "Rendering", id: "rend", avgCount: 60},
                { name: "WriteBack", id: "wback", avgCount: 60},
                { name: "Frame", id: "frame", avgCount: 60}
            ]);
        } catch (error) {
            if (getErrorMessage(error).includes('Unsupported feature: timestamp-query')) {
    
                _timestampQueriesEnabled = false;
                console.warn("TimeStamp-Queries are not supported on this browser. (Chrome/Canary you need to start with flag: --disable-dawn-features=disallow_unsafe_apis, read more here: https://omar-shehata.medium.com/how-to-use-webgpu-timestamp-query-9bf81fb5344a");
                ui.TH.setGroups([
                    {name: "Overall Frame-Time", id: "frame", avgCount: 60}
                ]);
                _device = await _adapter?.requestDevice() as GPUDevice;
            } else {
                throw error;
            }
        }
        _context = _canvas.getContext('webgpu') as unknown as GPUCanvasContext;
        _context.configure({
            device: _device,
            format: format,
            alphaMode: "premultiplied"
        });
        if (_timestampQueriesEnabled) {
            _querySet = _device.createQuerySet({
                type: "timestamp",
                count: QUERY_CAPACITY
            });
            _queryBuffer = _device.createBuffer({
                size: 8 * QUERY_CAPACITY,
                usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
            });
            _queryReadBuffer = createEmptyGPUBuffer(_device, _queryBuffer.size, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
        }
        createMapBuffer();
        _minmaxValueBuffer = createEmptyGPUBuffer(_device, 4 * 4, GPUBufferUsage.STORAGE);
        _uniformBuffer = createGpuBuffer(_device, uniformBuffer.get_buffer(), Uint8Array, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
        createGridBuffer();
        createPipelines(format);
    }

    uniformBuffer.refresh_db_properties(DB);

    if (_frameInFlight) {
        console.error("asdasdasd");
    }
    createPositionBuffer();
    createTemperatureBuffer();
    createBindGroups();

    _initialised = true;
}

const getProjectedPoints = (points:number[]) => {
    const pointsProjected:number[] = [];
    for (let i = 0; i < points.length; i += 2) {
        let tmp:Vec2_f32 = projectPoint(points[i], points[i+1]);
        pointsProjected.push( tmp.x_f32 ); // latitude 
        pointsProjected.push( tmp.y_f32 ); // longitude
    }
    return pointsProjected;
}

const triangulateGeoJson = (geojson:any):[number[], number[]] =>  {
    const geoData = geoJsonCoords(geojson);
    const delaunay = Delaunay.from(geoData);

    const points: number[] = [];
    for (let i = 0; i < delaunay.points.length; i += 2) {
        points.push(delaunay.points[i + 1]);
        points.push(delaunay.points[i]);
    }
    
    const triangles: number[] = [];
    for (let i = 0; i < delaunay.triangles.length; i += 3) {
        const t0 = delaunay.triangles[i];
        const t1 = delaunay.triangles[i + 1];
        const t2 = delaunay.triangles[i + 2];
        const centerX = (delaunay.points[t0 * 2] + delaunay.points[t1 * 2] + delaunay.points[t2 * 2]) / 3.0;
        const centerY = (delaunay.points[t0 * 2 + 1] + delaunay.points[t1 * 2 + 1] + delaunay.points[t2 * 2 + 1]) / 3.0;
        const point = [centerX, centerY];
        if (geojson.features.some((feature: any) => booleanPointInPolygon(point, feature))) {
            triangles.push(t0, t1, t2);
        }
    }

    return [ points, triangles ]
}

const createMapBuffer = () => {
    let [points, triangles] = triangulateGeoJson(geoJsonMap);
    _mapPoints = points;
    _mapTriangleCount = triangles.length;
    freeGpuBuffer(_mapIndexBuffer);
    _mapIndexBuffer = createGpuBuffer(_device, triangles, Uint32Array, GPUBufferUsage.INDEX);
    let projPoints = getProjectedPoints(_mapPoints);
    freeGpuBuffer(_mapVertexBuffer);
    _mapVertexBuffer = createGpuBuffer(_device, projPoints, Float32Array, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);

    let [pointsBound, trianglesBound] = triangulateGeoJson(geoJsonMapBoundries);
    _mapBoundriesPoints = pointsBound;
    _mapBoundriesTriangleCount = trianglesBound.length;
    freeGpuBuffer(_mapBoundriesIndexBuffer);
    _mapBoundriesIndexBuffer = createGpuBuffer(_device, trianglesBound, Uint32Array, GPUBufferUsage.INDEX);
    let projPointsBound = getProjectedPoints(_mapBoundriesPoints);
    freeGpuBuffer(_mapBoundriesVertexBuffer);
    _mapBoundriesVertexBuffer = createGpuBuffer(_device, projPointsBound, Float32Array, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);    

    freeGpuBuffer(_mapModelBuffer);
    _mapModelBuffer = createGpuBuffer(_device, colorsMap.continents, Float32Array, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
    freeGpuBuffer(_mapBoundriesModelBuffer);
    _mapBoundriesModelBuffer = createGpuBuffer(_device, colorsMap.water, Float32Array, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
}

const updateMapPointBuffer = () => {
    let projPoints = getProjectedPoints(_mapPoints);
    _device.queue.writeBuffer(_mapVertexBuffer, 0, new Float32Array(projPoints));
    let projPointsBound = getProjectedPoints(_mapBoundriesPoints);
    _device.queue.writeBuffer(_mapBoundriesVertexBuffer, 0, new Float32Array(projPointsBound));
}

const createGridBuffer = () => {
    uniformBuffer.set_screensize(_canvas.width, _canvas.height);
    let pointCount = uniformBuffer.get_pointcount();
    freeGpuBuffer(_gridBuffer)
    _gridBuffer = createEmptyGPUBuffer(_device, pointCount * 4 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC);
    freeGpuBuffer(_workgroupBoundsBuffer);
    _workgroupBoundsBuffer = createEmptyGPUBuffer(_device, Math.ceil(pointCount / BINNING_WORKGROUP_SIZE) * 4 * 2 , GPUBufferUsage.STORAGE);
}

const createGridReadBuffer = () => {
    freeGpuBuffer(_gridReadBuffer);
    _gridReadBuffer = createEmptyGPUBuffer(_device, _gridBuffer.size, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
}

const createPositionBuffer = () => {/*
    for (let i = 0; i < DB.positions.length; i++) {
        let tmp:Vec2_f32 = projectPoint(DB.positions[i]['lat'], DB.positions[i]['lon']);
        DB.positions[i]['x'] = tmp.x_f32;
        DB.positions[i]['y'] = tmp.y_f32;
    }

    const positionsArrayBuffer = new ArrayBuffer(DB.positions.length * 4 * 8);
    const pabView = new DataView(positionsArrayBuffer);
    for (let i = 0; i < DB.positions.length; i++) {
        pabView.setFloat32(i * 32, DB.positions[i]['x'], true);
        pabView.setFloat32(i * 32 + 4, DB.positions[i]['y'], true);
        pabView.setInt32(i * 32 + 8, DB.positions[i]['id_min'], true);
        pabView.setInt32(i * 32 + 12, DB.positions[i]['id_max'], true);
    }
    freeGpuBuffer(_positionBuffer);
    _positionBuffer = createGpuBuffer(_device, positionsArrayBuffer, Uint8Array, GPUBufferUsage.STORAGE);
    
    kdPositionBuffer.from_data(DB);
    freeGpuBuffer(_kdPositionBuffer);
    _kdPositionBuffer = createGpuBuffer(_device, kdPositionBuffer.get_buffer(), Uint8Array, GPUBufferUsage.STORAGE);
*/
}

const maxu16 = 2**16-1;
const packTemperatureEntry = (t:Database["temperatures"][0]):number => {/*
    if (t.dm >= 2**15 || t.src >= 2**1) {
        console.error("DM or src is out of bounds. Visualization will not be accurate!");
        t.dm = 2**15 -1;
        t.src = 0;
    }
    let dm = t.dm << 17;
    let src = t.src << 16;
    let tdis = discretize(t.avgt, DB.bounds_avgt.min, DB.bounds_avgt.max, maxu16);
    return dm | src | tdis;*/
    return 0;
}


const createTemperatureBuffer = () => {
    const temperaturesArrayBuffer = new ArrayBuffer(DB.temperatures.length * 1 * 4);
    const tabView = new DataView(temperaturesArrayBuffer);
    for (let i = 0; i < DB.temperatures.length; i++) {
        let t = DB.temperatures[i];
        tabView.setUint32(i * 4, packTemperatureEntry(t), true);
    }
    freeGpuBuffer(_temperatureBuffer);
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

    _binningPipeline = _device.createComputePipeline({
        layout: "auto",
        compute: {
            module: _device.createShaderModule({
                code: comp_binning_shader
            }),
            entryPoint: "cs_main",
        }
    });

    _minMaxPipeline = _device.createComputePipeline({
        layout: "auto",
        compute: {
            module: _device.createShaderModule({
                code: comp_minmax_shader
            }),
            entryPoint: "cs_main"
        }
    });

    _drawMapPipeline = _device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: _device.createShaderModule({
                code: rend_map_shader
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
                code: rend_map_shader
            }),
            entryPoint: "fs_main",
            targets: [{
                format: format,
                blend: {
                    color: {
                        srcFactor: 'src-alpha',
                        dstFactor: 'one-minus-src-alpha',
                        operation: 'add'
                    },
                    alpha: {
                        srcFactor: 'src-alpha',
                        dstFactor: 'one-minus-src-alpha',
                        operation: 'add'
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
                code: rend_grid_shader
            }),
            entryPoint: "vs_main"
        },
        fragment: {
            module: _device.createShaderModule({
                code: rend_grid_shader
            }),
            entryPoint: "fs_main",
            targets: [{
                format: format,
                blend: {
                    color: {
                        srcFactor: 'src-alpha',
                        dstFactor: 'one-minus-src-alpha',
                        operation: 'add'
                    },
                    alpha: {
                        srcFactor: 'src-alpha',
                        dstFactor: 'one-minus-src-alpha',
                        operation: 'add'
                    }
                }
            }
            ]
        },
        primitive: {
            topology: "triangle-strip"
        }
    });

    _drawPointsPipeline = _device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: _device.createShaderModule({
                code: rend_points_shader
            }),
            entryPoint: "vs_main"
        },
        fragment: {
            module: _device.createShaderModule({
                code: rend_points_shader
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
            { binding: 2, resource: { buffer: _positionBuffer } },
            { binding: 3, resource: { buffer: _temperatureBuffer } }
        ]
    });

    _binningBindGroup = _device.createBindGroup({
        layout: _binningPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: _uniformBuffer } },
            { binding: 1, resource: { buffer: _gridBuffer } },
            { binding: 2, resource: { buffer: _positionBuffer } },
            { binding: 4, resource: { buffer: _workgroupBoundsBuffer } },
            { binding: 5, resource: { buffer: _kdPositionBuffer } }
        ]
    });

    _minMaxBindGroup = _device.createBindGroup({
        layout: _minMaxPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: _uniformBuffer } },
            //{ binding: 1, resource: { buffer: _gridBuffer } },
            { binding: 2, resource: { buffer: _minmaxValueBuffer } },
            { binding: 3, resource: { buffer: _workgroupBoundsBuffer }}
        ]
    });

    _drawMapBindGroup = _device.createBindGroup({
        layout: _drawMapPipeline.getBindGroupLayout(0),
        entries: [
            //{ binding: 0, resource: { buffer: _uniformBuffer } },
            { binding: 1, resource: { buffer: _mapModelBuffer }}
        ]
    });

    _drawMapBoundriesBindGroup = _device.createBindGroup({
        layout: _drawMapPipeline.getBindGroupLayout(0),
        entries: [
            //{ binding: 0, resource: { buffer: _uniformBuffer } },
            { binding: 1, resource: { buffer: _mapBoundriesModelBuffer }}
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

    _drawPointsBindGroup = _device.createBindGroup({
        layout: _drawPointsPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: _uniformBuffer }},
            { binding: 1, resource: { buffer: _positionBuffer }}
        ]
    });
}

export const stopBenchmark = async () => {
    _benchmarkEnabled = false;
}

export const startBenchmark = async () => {
    _benchmarkEnabled = true;
    while (_benchmarkEnabled) {
        await renderFrame(BufferFlags.NONE, RenderFlags.STAGE_AGGREGATE);
    }
}

export enum BufferFlags {
    NONE = 0,
    UPDATE_MAP_BUFFER = 1 << 0,
    UPDATE_GRID_BUFFER = 1 << 1,
    UPDATE_POSITION_BUFFER = 1 << 2,
}

export enum RenderFlags {
    NONE = 0,
    STAGE_RENDERING = 1 << 0,
    STAGE_WRITEBACK = 1 << 1,
    STAGE_BINNING_MINMAX = 1 << 2,
    STAGE_AGGREGATE = 1 << 3,
}

var queuedFrame:null|{
    bufferflags: BufferFlags,
    renderflags: RenderFlags
} = null;

export const renderFrame = async (bufferflags:number = BufferFlags.NONE, renderflags:number = RenderFlags.STAGE_RENDERING) => {
    
    if (!_initialised) return;
    if (_frameInFlight) {
        // In a few scenarios we can not just discard the frame. (e.g. buffer change) Lets queue it and merge with other queued ones.
        if (queuedFrame) {
            queuedFrame = { bufferflags: queuedFrame.bufferflags | bufferflags, renderflags: queuedFrame.renderflags | renderflags };
        } else {
            queuedFrame = { bufferflags: bufferflags, renderflags: renderflags };
        }
        return;
    }
    _frameInFlight = true;
    queuedFrame = { bufferflags: bufferflags, renderflags: renderflags };
    while (queuedFrame) {
        start = Date.now();
        bufferflags |= queuedFrame.bufferflags;
        renderflags |= queuedFrame.renderflags;
        queuedFrame = null;

        if ((bufferflags & BufferFlags.UPDATE_GRID_BUFFER) !== 0) {
            createGridBuffer();
        }
        if ((bufferflags & BufferFlags.UPDATE_MAP_BUFFER) !== 0) {
            updateMapPointBuffer();
        }
        if ((bufferflags & BufferFlags.UPDATE_POSITION_BUFFER) !== 0) {
            createPositionBuffer();
        }
        if (bufferflags >= BufferFlags.UPDATE_GRID_BUFFER) {
            createBindGroups();
        }
    
        // Update uniform buffer and model color buffer:
        _device.queue.writeBuffer(_uniformBuffer, 0, uniformBuffer.get_buffer());
        _device.queue.writeBuffer(_mapModelBuffer, 0, new Float32Array(colorsMap.continents));
        _device.queue.writeBuffer(_mapBoundriesModelBuffer, 0, new Float32Array(colorsMap.water));
        let pointCount = uniformBuffer.get_pointcount();
    
        var commandEncoder: GPUCommandEncoder;
        var start:number;

        commandEncoder = _device.createCommandEncoder();
        if (_timestampQueriesEnabled) commandEncoder.writeTimestamp(_querySet, 0);
        if (renderflags >= RenderFlags.STAGE_AGGREGATE) {
            const aggregatePass = commandEncoder.beginComputePass();
    
            aggregatePass.setPipeline(_aggregatePipeline);
            aggregatePass.setBindGroup(0, _aggregateBindGroup);
            aggregatePass.dispatchWorkgroups(Math.ceil(DB.locations.length / AGGREGATE_WORKGROUP_SIZE));
            aggregatePass.end();
            if (_timestampQueriesEnabled) commandEncoder.writeTimestamp(_querySet, 1);
        }
    
        if (renderflags >= RenderFlags.STAGE_BINNING_MINMAX) {
            const binningPass = commandEncoder.beginComputePass();
            binningPass.setPipeline(_binningPipeline);
            binningPass.setBindGroup(0, _binningBindGroup);
            binningPass.dispatchWorkgroups(Math.ceil(pointCount / BINNING_WORKGROUP_SIZE));
            binningPass.end();
            if (_timestampQueriesEnabled) commandEncoder.writeTimestamp(_querySet, 2);
            const avgPass = commandEncoder.beginComputePass();
            avgPass.setPipeline(_minMaxPipeline);
            avgPass.setBindGroup(0, _minMaxBindGroup);
            avgPass.dispatchWorkgroups(1);
            avgPass.end();
            if (_timestampQueriesEnabled) commandEncoder.writeTimestamp(_querySet, 3);
        }
    
    
        if (renderflags >= RenderFlags.STAGE_RENDERING) {
            const textureView = _context.getCurrentTexture().createView();
            const renderPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: textureView,
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }, //background color
                    loadOp: 'load',
                    storeOp: 'store'
                }]
            });
    
            renderPass.setPipeline(_drawMapPipeline);
    
            renderPass.setBindGroup(0, _drawMapBoundriesBindGroup);
            renderPass.setVertexBuffer(0, _mapBoundriesVertexBuffer);
            renderPass.setIndexBuffer(_mapBoundriesIndexBuffer, 'uint32');
            renderPass.drawIndexed(_mapBoundriesTriangleCount);
    
            renderPass.setBindGroup(0, _drawMapBindGroup);
            renderPass.setVertexBuffer(0, _mapVertexBuffer);
            renderPass.setIndexBuffer(_mapIndexBuffer, 'uint32');
            renderPass.drawIndexed(_mapTriangleCount);
    
    
            renderPass.setPipeline(_drawGridPipeline);
            renderPass.setBindGroup(0, _drawGridBindGroup);
            renderPass.draw(6, pointCount);
            
            if (_pointRendering) {
                renderPass.setPipeline(_drawPointsPipeline);
                renderPass.setBindGroup(0, _drawPointsBindGroup);
                renderPass.draw(4, DB.locations.length);
            }
    
            renderPass.end();
            if (_timestampQueriesEnabled) commandEncoder.writeTimestamp(_querySet, 4);
        }
    
        if (renderflags >= RenderFlags.STAGE_WRITEBACK) {
            // Create readback buffer:
            createGridReadBuffer();
            commandEncoder.copyBufferToBuffer(_gridBuffer, 0, _gridReadBuffer, 0, _gridReadBuffer.size);
            if (_timestampQueriesEnabled) commandEncoder.writeTimestamp(_querySet, 5);
        }
    
        // Resolve Timestamps:
        if (_timestampQueriesEnabled) {
            commandEncoder.resolveQuerySet(_querySet, 0, QUERY_CAPACITY, _queryBuffer, 0);
            commandEncoder.copyBufferToBuffer(_queryBuffer, 0, _queryReadBuffer, 0, _queryBuffer.size);
        }
    
        _device.queue.submit([commandEncoder.finish()]);
        await _device.queue.onSubmittedWorkDone();  // ToDo: Not waiting for this and creation of ringbuffers for reading
    
        if (renderflags >= RenderFlags.STAGE_WRITEBACK) {
            await _gridReadBuffer.mapAsync(GPUMapMode.READ);
            const copyArrayBuffer: ArrayBuffer = _gridReadBuffer.getMappedRange();
            gridBuffer.from_buffer(copyArrayBuffer);
            ui.refreshGraphInformation(gridBuffer);
            _gridReadBuffer.unmap();
        }
    
        var times:ui.TimePushStruct[] = [];
        if (_timestampQueriesEnabled) {
            // wait for timestamp data to be available
            // Read the storage buffer data
            await _queryReadBuffer.mapAsync(GPUMapMode.READ);
            const copyArrayBuffer: ArrayBuffer = _queryReadBuffer.getMappedRange();
            // Decode it into an array of timestamps in nanoseconds
            const timingsNanoseconds = new BigInt64Array(copyArrayBuffer);
            // Now lets calculate all time differences:
            let diffSum:bigint = BigInt(0);
            if (renderflags >= RenderFlags.STAGE_AGGREGATE) {
                let delta = timingsNanoseconds[1] - timingsNanoseconds[0];
                diffSum += delta;
                times.push({id:"agg", time:Number(delta) / 1000000});
            }
            if (renderflags >= RenderFlags.STAGE_BINNING_MINMAX) {
                var delta = timingsNanoseconds[2] - timingsNanoseconds[0] - diffSum;
                diffSum += delta;
                times.push({id:"bin", time:Number(delta) / 1000000});
                delta = timingsNanoseconds[3] - timingsNanoseconds[0] - diffSum;
                diffSum += delta;
                times.push({id:"minmax", time:Number(delta) / 1000000});
            }
            if (renderflags >= RenderFlags.STAGE_RENDERING) {
                let delta = timingsNanoseconds[4] - timingsNanoseconds[0] - diffSum;
                diffSum += delta;
                times.push({id:"rend", time:Number(delta) / 1000000});
            }
            if (renderflags >= RenderFlags.STAGE_WRITEBACK) {
                let delta = timingsNanoseconds[5] - timingsNanoseconds[0] - diffSum;
                diffSum += delta;
                times.push({id:"wback", time:Number(delta) / 1000000});
            }
            _queryReadBuffer.unmap();
        }
        times.push({id:"frame", time:Date.now() - start});
        TH.pushTimes(times);
    }
    _frameInFlight = false;
}

