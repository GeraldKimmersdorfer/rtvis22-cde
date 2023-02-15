struct Output {
    @builtin(position) Position : vec4<f32>,
    @location(0) vColor : vec4<f32>,
};

struct Uniforms {
	gridProperties: vec4<f32>,      // hexagon size, vertical space, horizontal space, border
    screenSize: vec2<u32>,          // the size of the viewport
    gridResolution: vec2<u32>,      // resolution of the grid

    timeRangeBounds: vec4<u32>,     // contains TimeAMin, TimeAMax, TimeBMin, TimeBMax already in the appropriate dm
    monthComparison: i32,           // which month to compare (-1... whole year, 0...January, ...)
    firstMonthIndex: u32,           // contains the index of the first month. (in the dataset the first month is dec 1743 therefore it will be 11)

    gridAspect: u32,                // 1 if grid should respect viewport aspect ratio
    colorMode: u32,                 // 0...sequential, 1...diverging
    colorA: vec4<f32>,              // color for min values
    colorB: vec4<f32>,              // color for 0 (if diverging)
    colorC: vec4<f32>,              // color for max values
    colorNull: vec4<f32>,           // color for empty cell
    colorMap: vec4<f32>,            // color of the map

    hoverIndex: i32,                // contains the id of the active grid cell
};

struct PositionEntry {
    position: vec2<f32>,            // the precalculated x and y position
    index_bounds: vec2<u32>         // min and max id inside temperaturelist, (requires temperaturelist sorted by pid)
}


@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> positions: array<PositionEntry>;


@vertex
fn vs_main(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
) -> Output {
    var output:Output;
    return output;
}
