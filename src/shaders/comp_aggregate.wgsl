
struct Uniforms {
	gridProperties: vec4<f32>,		// hexagon size, vertical space, horizontal space, border
    screenSize: vec2<u32>,			// the size of the viewport
    gridResolution: vec2<u32>,		// resolution of the grid
    
    colorMode: u32,                 // 0...sequential, 1...diverging
    colorA: vec4<f32>,              // color for max values
    colorB: vec4<f32>,              // color for 0 (if diverging)
    colorC: vec4<f32>               // color for min values
};

struct PositionEntry {
    position: vec2<f32>,            // the precalculated x and y position
    index_bounds: vec2<u32>         // min and max id inside temperaturelist, (requires temperaturelist sorted by pid)
}

struct TemperatureEntry {
    dm: u32,
    avgt: f32,
    src: u32
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
/* NOTE: I had to figure out the hardway that compute shaders can't write in an array<vec3<f32>>... */
@group(0) @binding(1) var<storage, read_write> grid: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> positions: array<PositionEntry>;
@group(0) @binding(3) var<storage, read> temperatures: array<TemperatureEntry>;

fn pos_inside_circle(pos:vec2<f32>, circle_middle:vec2<f32>, circle_radius:f32) -> bool {
    return (distance(pos, circle_middle) < circle_radius);
}

@compute @workgroup_size(64)
fn cs_main(
    @builtin(global_invocation_id) globalId: vec3<u32>
) {
    let i: u32 = globalId.x;
    let N: u32 = uniforms.gridResolution.x * uniforms.gridResolution.y;	
	// Guard against out-of-bounds workgroup sizes
	if (i >= N) {
		return;
	}

    // ToDo: Get from Gui
    let time_range_bounds:vec4<u32> = vec4<u32>(20, 400, 800, 1200);

    // Note: Executing the compute shader on the grid is probably a more elegant solution!
    let col = i % uniforms.gridResolution.x;
    let row = i / uniforms.gridResolution.x;
    var mPointPos:vec2<f32> = vec2<f32>(f32(col) * uniforms.gridProperties.z, f32(row) * uniforms.gridProperties.y);
    if (row % 2 == 1) { // offset for odd rows
        let x0 = uniforms.gridProperties.z / 2.0;
        mPointPos.x += x0;
    }

    //var val:f32 = f32(i) / f32(N);
    var val = 0.0;
    var alpha = 0.0;

    let posN = arrayLength(&positions);
    var tempSum: vec2<f32> = vec2<f32>(0.0, 0.0);
    var tempN: vec2<u32> = vec2<u32>(0, 0);
    for (var j:u32=0; j < posN; j++) {
        let p:PositionEntry = positions[j];
        // ToDo: Collision should be checked with hexagon not with circle (we have possible overlaps right now)
        // Note: To make it faster we could first check with outer circle to completely discard positions before doing the fine check
        if pos_inside_circle(p.position, mPointPos, uniforms.gridProperties.x) {
            tempSum = vec2<f32>(0.0, 0.0);
            tempN = vec2<u32>(0, 0);
            for (var k:u32=p.index_bounds[0]; k <= p.index_bounds[1]; k++) {
                let t:TemperatureEntry = temperatures[k];
                if (t.dm >= time_range_bounds[0] && t.dm <= time_range_bounds[1]) {
                    tempSum.x += t.avgt;
                    tempN.x += 1;
                }
                if (t.dm >= time_range_bounds[2] && t.dm <= time_range_bounds[3]) {
                    tempSum.y += t.avgt;
                    tempN.y += 1;
                }
            }  
        }
    }

    if (tempN.x > 0 && tempN.y > 0) { // Check for divbyzero error (no entry in given time range and position)
        var tempAvg: vec2<f32> = tempSum / vec2<f32>(tempN);
        val = tempAvg[1] - tempAvg[0];
        alpha = 0.9;
    }

    let tmp = temperatures[0];

    grid[i] = vec4<f32>(mPointPos, val, alpha);
    
}