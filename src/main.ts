import { CheckWebGPU, InitUserInterface, ShowNoWebGpuWarning } from './helper';
import "./styles/site.css";

import $ from "jquery";
import { RenderTriangle } from './renderer';

// Entry-Point of Application
const main = () => {
    // Check whether WebGPU is available
    const gpuAvailable = CheckWebGPU();
    if(!gpuAvailable){
        $("body").addClass("error");
        ShowNoWebGpuWarning();
        throw('Your current browser does not support WebGPU!');
    }

    // Initialize jQuery UI components, and show interface:
    InitUserInterface();

    RenderTriangle();
    window.addEventListener('resize', function(){
        RenderTriangle();
    });
}

$(function() {main()});