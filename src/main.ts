import './styles/styles.css';

import { CheckWebGPU } from './helper';
import * as ui from './ui'

import $ from "jquery";
import { RenderTriangle } from './renderer';
import { fetchAndUnpackData } from './datafetcher';

// Entry-Point of Application
const main = () => {
    // Check whether WebGPU is available
    const gpuAvailable = CheckWebGPU();
    if(!gpuAvailable){
        ui.ShowNoWebGpuWarning();
        throw('Your current browser does not support WebGPU!');
    }

    // Initialize jQuery UI components, and show interface:
    ui.InitUserInterface();
    ui.showFooter();

    ui.loadingDialogProgress(0.5);
    fetchAndUnpackData(function on_success(db:any) {
        console.log(db);
        ui.loadingDialogSuccess("We're all set and ready");
        ui.showMainMenu();
        ui.showCanvas();
        RenderTriangle();
        window.addEventListener('resize', function(){
            RenderTriangle();
        });
    }, function on_failure(msg:string) {
        ui.loadingDialogError(msg);
    });



}

$(function() {main()});
