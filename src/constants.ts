interface Constants {
    voxelDim: number,
    voxelDimMinusOne: number,
    wsVoxelSize: number,
    wsChunkSize: number,
    invVoxelDim: number,
    invVoxelDimMinusOne: number,
    margin: number,
    voxelDimPlusMargins: number,
    voxelDimPlusMarginsMinusOne: number,
    invVoxelDimPlusMargins: number,
    invVoxelDimPlusMarginsMinusOne: number,
}

function genConstants(voxelDim: number) {
    const chunkSize = 4;
    const margin = 4;
    return {
        voxelDim: voxelDim,
        voxelDimMinusOne: voxelDim - 1,
        wsVoxelSize: 1.0 / (voxelDim - 1),
        wsChunkSize: chunkSize,
        invVoxelDim: 1.0 / voxelDim,
        invVoxelDimMinusOne: 1.0 / (voxelDim - 1),
        margin: margin,
        voxelDimPlusMargins: voxelDim + margin * 2,
        voxelDimPlusMarginsMinusOne: voxelDim - 1 + margin * 2,
        invVoxelDimPlusMargins: 1.0 / (voxelDim + margin * 2),
        invVoxelDimPlusMarginsMinusOne: 1.0 / (voxelDim - 1 + margin * 2),
    }
}

export const constants: Constants = genConstants(16);
export const constantsWGSL = `
    const voxelDim = ${constants.voxelDim};
    const voxelDimMinusOne = ${constants.voxelDimMinusOne};
    const wsVoxelSize = ${constants.wsVoxelSize};
    const wsChunkSize = ${constants.wsChunkSize};
    const invVoxelDim = ${constants.invVoxelDim};
    const invVoxelDimMinusOne = ${constants.invVoxelDimMinusOne};
    const margin = ${constants.margin};
    const voxelDimPlusMargins = ${constants.voxelDimPlusMargins};
    const voxelDimPlusMarginsMinusOne = ${constants.voxelDimPlusMarginsMinusOne};
    const invVoxelDimPlusMargins = ${constants.invVoxelDimPlusMargins};
    const invVoxelDimPlusMarginsMinusOne = ${constants.invVoxelDimPlusMarginsMinusOne};
`

// 32 rays with a nice poisson distribution on a sphere, as taken from GPU Gems 3
export const raydirsWGSL = `
    const ray_dirs = array<vec4f, 32>(
        vec4f(0.286582 , 0.257763 , -0.922729   ,  0 ),
        vec4f(-0.171812 , -0.888079 , 0.426375  ,  0 ),
        vec4f(0.440764 , -0.502089 , -0.744066  ,   0),
        vec4f(-0.841007 , -0.428818 , -0.329882 ,  0 ),
        vec4f(-0.380213 , -0.588038 , -0.713898 ,  0 ),
        vec4f(-0.055393 , -0.207160 , -0.976738 ,  0 ),
        vec4f(-0.901510 , -0.077811 , 0.425706  ,  0 ),
        vec4f(-0.974593 , 0.123830 , -0.186643  , 0 ,),
        vec4f(0.208042 , -0.524280 , 0.825741   ,   0),
        vec4f(0.258429 , -0.898570 , -0.354663  ,   0),
        vec4f(-0.262118 , 0.574475 , -0.775418  , 0 ,),
        vec4f(0.735212 , 0.551820 , 0.393646    ,  0 ),
        vec4f(0.828700 , -0.523923 , -0.196877  ,   0),
        vec4f(0.788742 , 0.005727 , -0.614698   ,  0 ),
        vec4f(-0.696885 , 0.649338 , -0.304486  , 0 ,),
        vec4f(-0.625313 , 0.082413 , -0.776010  , 0 ,),
        vec4f(0.358696 , 0.928723 , 0.093864    ,  0 ),
        vec4f(0.188264 , 0.628978 , 0.754283    ,  0 ),
        vec4f(-0.495193 , 0.294596 , 0.817311   , 0 ,),
        vec4f(0.818889 , 0.508670 , -0.265851   ,  0 ),
        vec4f(0.027189 , 0.057757 , 0.997960    ,  0 ),
        vec4f(-0.188421 , 0.961802 , -0.198582  , 0 ,),
        vec4f(0.995439 , 0.019982 , 0.093282    ,  0 ),
        vec4f(-0.315254 , -0.925345 , -0.210596 ,  0 ),
        vec4f(0.411992 , -0.877706 , 0.244733   ,   0),
        vec4f(0.625857 , 0.080059 , 0.775818    ,  0 ),
        vec4f(-0.243839 , 0.866185 , 0.436194   , 0 ,),
        vec4f(-0.725464 , -0.643645 , 0.243768  ,  0 ),
        vec4f(0.766785 , -0.430702 , 0.475959   ,   0),
        vec4f(-0.446376 , -0.391664 , 0.804580  ,  0 ),
        vec4f(-0.761557 , 0.562508 , 0.321895   , 0 ,),
        vec4f(0.344460 , 0.753223 , -0.560359   ,  0 ),
    );
    const occlusion_amt = array<vec4f, 16>(
        // .x is (1-i/16)^2.5
        // .y is (1-i/16)^0.3
        // .z is (1-i/16)^0.4
        // .w is (1-i/16)^0.5
        vec4f(1          ,  1.000000000,	1.000000000,	1.000000000) ,
        vec4f(0.850997317,  0.980824675,	0.97451496 ,    0.968245837) ,
        vec4f(0.716176609,  0.960732353,	0.947988832,	0.935414347) ,
        vec4f(0.595056802,  0.93960866 ,    0.920299843,    0.901387819) ,
        vec4f(0.48713929 ,  0.917314755,	0.891301229,	0.866025404) ,
        vec4f(0.391905859,  0.893679531,	0.860813523,	0.829156198) ,
        vec4f(0.308816178,  0.868488366,	0.828613504,	0.790569415) ,
        vec4f(0.237304688,  0.841466359,	0.794417881,	0.75       ) ,
        vec4f(0.176776695,  0.812252396,	0.757858283,	0.707106781) ,
        vec4f(0.126603334,  0.780357156,	0.718441189,	0.661437828) ,
        vec4f(0.086114874,  0.745091108,	0.675480019,	0.612372436) ,
        vec4f(0.054591503,  0.705431757,	0.627971608,	0.559016994) ,
        vec4f(0.03125    ,  0.659753955,	0.574349177,	0.5        ) ,
        vec4f(0.015223103,  0.605202038,	0.511918128,	0.433012702) ,
        vec4f(0.005524272,  0.535886731,	0.435275282,	0.353553391) ,
        vec4f(0.000976563,  0.435275282,	0.329876978,	0.25       ) ,
    );         
`