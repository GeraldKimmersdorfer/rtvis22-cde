struct Output {
    @builtin(position) Position : vec4<f32>,
    @location(0) vColor : vec4<f32>,
    @location(1) uv: vec2<f32>
};

const quad = array<vec2<f32>, 4>(
	vec2<f32>(-1f, -1f),
    vec2<f32>(-1f,  1f),
	vec2<f32>( 1f, -1f),
    vec2<f32>( 1f,  1f)
);

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
    var scale:vec2<f32> = vec2<f32>(uniforms.sizePoints);
    scale.x /= f32(uniforms.screenSize.x) / f32(uniforms.screenSize.y);
    var newPos:vec2<f32> = positions[instanceIndex].position + quad[vertexIndex] * scale;
    newPos -= 0.5; 
    newPos *= 2.0;
    output.Position = vec4<f32>(newPos, 0f, 1f);
    output.vColor = uniforms.colorPoints;
    output.uv = quad[vertexIndex];
    return output;
}


@fragment
fn fs_main(@location(0) vColor: vec4<f32>, @location(1) uv: vec2<f32>) -> @location(0) vec4<f32> {
	let distanceFromCenterSquared = dot(uv, uv);
	if (distanceFromCenterSquared > 1f) {
		discard;
	}
	//if (distanceFromCenterSquared > 0.9f) {
	//	return vec4<f32>(0f, 0f, 0f, 1f); // Stroke/Border of circle
	//}
	return uniforms.colorPoints; // Fill of circle
}