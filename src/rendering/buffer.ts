
interface Vec4_f32 {
    x_f32: number,
    y_f32: number,
    z_f32: number,
    w_f32: number
}

interface Vec2_u32 {
    x_u32: number,
    y_u32: number
}

interface Vec3_u32 {
    x_u32: number,
    y_u32: number,
    z_u32: number
}

export class UniformBuffer {

    gridProperties: {
        scale: number,
        vs: number,
        hs: number,
        border: number
    } = { scale: 0.006, vs: 0, hs: 0, border: 0.1};
    screenSize: Vec2_u32 = { x_u32: 256, y_u32: 0 }
    gridResolution: Vec2_u32 =  { x_u32: 0, y_u32: 0 }
    gridAspect_u32: number = 1;
    colorMode_u32: number = 1;
    buff2: Vec2_u32 = {x_u32:0, y_u32:0 };
    colorA: Vec4_f32 = { x_f32: 33.0/255.0, y_f32: 102.0/255.0, z_f32: 172.0/255.0, w_f32: 0.9 };
    colorB: Vec4_f32 = { x_f32: 1.0, y_f32: 1.0, z_f32: 1.0, w_f32: 0.5 };
    colorC: Vec4_f32 = { x_f32: 178.0/255.0, y_f32: 24.0/255.0, z_f32: 43.0/255.0, w_f32: 0.9 };

    constructor(gridscale: number = 0.01) {
        this.set_gridscale(gridscale);
    }

    set_gridscale(scale: number) {
        this.gridProperties.scale = scale;
        // refresh vertical and horizontal spacing:
        this.gridProperties.hs = Math.sqrt(3) * this.gridProperties.scale;
        this.gridProperties.vs = 3.0 / 2.0 * this.gridProperties.scale;
        this.gridResolution = {
            x_u32: Math.ceil(1.0 / this.gridProperties.hs) + 1,
            y_u32: Math.ceil(1.0 / this.gridProperties.vs) + 1
        };
    }

    set_screensize(width: number, height: number) {
        this.screenSize = {x_u32: width, y_u32: height};
    }

    get_pointcount():number {
        return this.gridResolution.x_u32 * this.gridResolution.y_u32;
    }

    // Dark magic function...
    _write_to_buffer(el: any, dv:DataView | null = null, byteOffset:number = 0): number {
        for (const k in el) {
            const v = el[k];
            if (typeof(v) == "object") {
                byteOffset = this._write_to_buffer(v, dv, byteOffset);
            } else if (typeof(v) == "number") {
                let type = k.split("_")[1];
                if (type == null) type = "f32";
                if (type == "u32") {
                    if (dv != null) dv.setUint32(byteOffset, v, true);
                    byteOffset += 4;
                } else {
                    if (dv != null) dv.setFloat32(byteOffset, v, true);
                    byteOffset += 4;
                }
            }
        }
        return byteOffset;
    }

    get_buffer(): ArrayBuffer {
        let byteLength = this._write_to_buffer(this);
        const uniformArrayBuffer = new ArrayBuffer(byteLength);
        this._write_to_buffer(this, new DataView(uniformArrayBuffer));
        return uniformArrayBuffer;
    }



}