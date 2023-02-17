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
    colorPoints: vec4<f32>,         // color of the positions if activated

    sizePoints: f32,                // size of the positions if activated
    hoverIndex: i32,                // contains the id of the active grid cell
};

struct ModelData {
    fillColor: vec4<f32>
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> model: ModelData;

@vertex
fn vs_main(
    @location(0) pos: vec2<f32>
) -> Output {
    var output: Output;
    let pos_transformed:vec2<f32> = (pos - vec2<f32>(0.5, 0.5)) * vec2<f32>(2.0, 2.0);
    output.Position = vec4<f32>(pos_transformed.xy, 0.0, 1.0);
    output.vColor = model.fillColor;
    return output;
}
