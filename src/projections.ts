import { degrees_to_radians } from "./helper";
import { Vec2_f32 } from "./rendering/vectors";



class Equirectangular {
    
    project(lat:number, lng:number):Vec2_f32 {
        let lambda = lng;
        let phi = lat;
        var point:Vec2_f32 = {
            x_f32 : (lambda + 180.0) / 360.0,
            y_f32 : (phi + 90.0) / 180.0
        };
        return point;
    }

}

class Robinson {

    mapWidth: number;
    mapHeight: number;
    fudgeX: number;
    fudgeY: number;
    earthRadius: number;
    AA:Array<number>;
    BB:Array<number>;

    constructor(mapWidth:number = 1.0, mapHeight:number = 1.97, fudgeX:number = 0.5, fudgeY:number = 0.5) {
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        this.fudgeX = fudgeX;
        this.fudgeY = fudgeY;
        this.earthRadius = (mapWidth/2.666269758)/2;
        this.AA = [0.8487,0.84751182,0.84479598,0.840213,0.83359314,0.8257851,0.814752,0.80006949,0.78216192,0.76060494,0.73658673,0.7086645,0.67777182,0.64475739,0.60987582,0.57134484,0.52729731,0.48562614,0.45167814];
        this.BB = [0,0.0838426,0.1676852,0.2515278,0.3353704,0.419213,0.5030556,0.5868982,0.67182264,0.75336633,0.83518048,0.91537187,0.99339958,1.06872269,1.14066505,1.20841528,1.27035062,1.31998003,1.3523];
    }

    project(lat:number, lng:number):Vec2_f32 {
        var roundToNearest = function(roundTo:number, value:number):number {
            return Math.floor(value/roundTo)*roundTo;  //rounds down
        };
        var getSign = function(value:number):number {
            return value < 0 ? -1 : 1;
        };

        var lngSign = getSign(lng), latSign = getSign(lat); //deals with negatives
        lng = Math.abs(lng); lat = Math.abs(lat); //all calculations positive
        var radian = 0.017453293; //pi/180
        var low = roundToNearest(5, lat-0.0000000001); //want exact numbers to round down
        low = (lat == 0) ? 0 : low; //except when at 0
        var high = low + 5;
        
        // indicies used for interpolation
        var lowIndex = low/5;
        var highIndex = high/5;
        var ratio = (lat-low)/5;

        // interpolation in one dimension
        var adjAA = ((this.AA[highIndex]-this.AA[lowIndex])*ratio)+this.AA[lowIndex];
        var adjBB = ((this.BB[highIndex]-this.BB[lowIndex])*ratio)+this.BB[lowIndex];
            
        //create point from robinson function
        var point:Vec2_f32 = {
            x_f32 : (adjAA * lng * radian * lngSign * this.earthRadius) + this.fudgeX,
            y_f32 : (adjBB * latSign * this.earthRadius) * (this.mapHeight / this.mapWidth) + this.fudgeY
        };
        
        return point;

    }

}

class EqualEarth {

    A:Array<number> = [1.340264, -0.081106, 0.000893, 0.003796];
    bounds = [2.7064373689368044, 1.317362759157413];

    constructor() {
    }

    project(lat:number, lng:number):Vec2_f32 {
        let lambda = degrees_to_radians(lng);
        let phi = degrees_to_radians(lat);
        let theta = Math.asin(Math.sqrt(3)/2.0*Math.sin(phi));
        let x = 2*Math.sqrt(3)*lambda*Math.cos(theta) / (3*(9*this.A[3]*theta**8+7*this.A[2]*theta**6+3*this.A[1]*theta**2+this.A[0]));
        let y = this.A[3]*theta**9+this.A[2]*theta**7+this.A[1]*theta**3+this.A[0]*theta;
            
        //create point from robinson function
        var point:Vec2_f32 = {
            x_f32 : x / (2*this.bounds[0]) + 0.5,
            y_f32 : y / (2*this.bounds[1]) + 0.5
        };
        
        return point;

    }

}

class Hammer {

    A:Array<number> = [1.340264, -0.081106, 0.000893, 0.003796];
    bounds = [2.8280057571023933, 1.4142135623730951];

    constructor() {
    }

    project(lat:number, lng:number):Vec2_f32 {
        let lambda = degrees_to_radians(lng);
        let phi = degrees_to_radians(lat);
        let theta = Math.asin(Math.sqrt(3)/2.0*Math.sin(phi));
        let x = (2*Math.sqrt(2)*Math.cos(phi)*Math.sin(lambda/2)) / Math.sqrt(1+Math.cos(phi)*Math.cos(lambda/2));
        let y = (Math.sqrt(2)*Math.sin(phi)) / Math.sqrt(1+Math.cos(phi)*Math.cos(lambda/2));
            
        //create point from robinson function
        var point:Vec2_f32 = {
            x_f32 : x / (2*this.bounds[0]) + 0.5,
            y_f32 : y / (2*this.bounds[1]) + 0.5
        };
        
        return point;

    }

}

var _projectionFunctions:any = {
    "Equirectangular": new Equirectangular(),
    "Robinson": new Robinson(),
    "EqualEarth": new EqualEarth(),
    "Hammer": new Hammer()
}

var _currentProjection:any = _projectionFunctions['Equirectangular'];

export function setCurrentProjection(projName:string) {
    _currentProjection = _projectionFunctions[projName];
}

export function projectPoint(lat:number, lng:number):Vec2_f32 {
    return _currentProjection.project(lat, lng);
}