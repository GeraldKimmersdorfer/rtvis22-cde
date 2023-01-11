
struct Uniforms {
	gridProperties: vec4<f32>,		// hexagon size, vertical space, horizontal space, border
    screenSize: vec2<u32>,			// the size of the viewport
    gridResolution: vec2<u32>,		// resolution of the grid

    timeRangeBounds: vec4<u32>,     // contains TimeAMin, TimeAMax, TimeBMin, TimeBMax already in the appropriate dm
    monthComparison: i32,           // which month to compare (-1... whole year, 0...January, ...)
    firstMonthIndex: u32,           // contains the index of the first month. (in the dataset the first month is dec 1743 therefore it will be 11)

    gridAspect: u32,                // 1 if grid should respect viewport aspect ratio
    colorMode: u32,                 // 0...sequential, 1...diverging
    colorA: vec4<f32>,              // color for max values
    colorB: vec4<f32>,              // color for 0 (if diverging)
    colorC: vec4<f32>,              // color for min values
    colorNull: vec4<f32>            // color for empty cell
};

struct GridEntry {
    mPoint: vec2<f32>,
    value: f32,
    valueN: u32
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> grid: array<GridEntry>;
@group(0) @binding(2) var<storage, read_write> minmaxvalues: vec4<f32>;


@compute @workgroup_size(64)
fn cs_main(
    @builtin(global_invocation_id) globalId: vec3<u32>
) {
    let i: u32 = globalId.x;
    let N: u32 = uniforms.gridResolution.x * uniforms.gridResolution.y;	

	// ToDo: This is ugly, as we just use one thread in the whole workgroup and iterate over the full grid...
    // Better way would be to already compute min/max in aggregate step of each workgroup and then
    // iterate over this (reduced) grid to compute the global min/max
	if (i == 0) {
		var minVal:f32 = 1000.0;
        var maxVal:f32 = -1000.0;
        var cnt:f32 = 0.0;
        for (var j:u32 = 0; j < N; j++) {
            if (grid[j].valueN > 0) {
                minVal = min(minVal, grid[j].value);
                maxVal = max(maxVal, grid[j].value);
                cnt += 1.0;
            }
        }
        minmaxvalues = vec4<f32>(minVal, maxVal, maxVal - minVal, cnt);
	}    
}