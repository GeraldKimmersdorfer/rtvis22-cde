
struct Uniforms {
	gridProperties: vec4<f32>,		// hexagon size, vertical space, horizontal space, border
    screenSize: vec2<u32>,			// the size of the viewport
    gridResolution: vec2<u32>,		// resolution of the grid
    
    colorMode: u32,                 // 0...sequential, 1...diverging
    colorA: vec4<f32>,              // color for max values
    colorB: vec4<f32>,              // color for 0 (if diverging)
    colorC: vec4<f32>               // color for min values
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> grid: array<vec4<f32>>;
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
		var minVal:f32 = grid[0].z;
        var maxVal:f32 = grid[0].z;
        for (var j:u32 = 1; j < N; j++) {
            minVal = min(minVal, grid[j].z);
            maxVal = max(maxVal, grid[j].z);
        }
        minmaxvalues = vec4<f32>(minVal, maxVal, maxVal - minVal, 0.0);
	}    
}