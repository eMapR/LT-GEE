/*

Copyright 2019 Justin Braaten Edited Peter Clary 2021

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.


> User guide: https://jdbcode.github.io/EE-LCB/
> Add repo to EE JS IDE - visit: https://code.earthengine.google.com/?accept_repo=users/jstnbraaten/modules
> Add repo to git - run: git clone https://earthengine.googlesource.com/users/jstnbraaten/modules

*/

var props = {
  startYear: 1986,
  endYear: 2018,
  startDate: '06-15',
  endDate: '09-15',
  cfmask: ['cloud', 'shadow', 'snow', 'water', 'jmask'],
  sensors: ['LT05', 'LE07', 'LC08'],
  harmonizeTo: 'LC08', //'LE07'
  exclude: [],
  compositeDate: '08-01',  
  doyTarget: 200,  // TODO: could this be a converted compositeDate - is there a case where you'd want them to be different?
  aoi: ee.Geometry.Point([-110.438,44.609]),
  resample: 'nearest-neighbor',
  startDateInt: getNumericMonthDay('06-15'),
  endDateInt: getNumericMonthDay('09-15'),
  interYear: false,
  compDateInt: getNumericMonthDay('08-01'),
  demMinnaert: 'USGS/GMTED2010',
  maskBuffer: 150,
  printProps: false,
  maskAux1: {
    swir1NormPath: '',
    blueNormPath: '',
    swir1StdevPath: '',
    blueStdevPath: '',
    swir1DifLimit: -3.5,
    blueDifLimit: 5,
    swir1ReflLimit: 700,
    blueReflLimit: 800
  }
};

// slope and intercept citation: Roy, D.P., Kovalskyy, V., Zhang, H.K., Vermote, E.F., Yan, L., Kumar, S.S, Egorov, A., 2016, Characterization of Landsat-7 to Landsat-8 reflective wavelength and normalized difference vegetation index continuity, Remote Sensing of Environment, 185, 57-70.(http://dx.doi.org/10.1016/j.rse.2015.12.024); Table 2 - reduced major axis (RMA) regression coefficients
var harmonizeLine = {
  oliTmTMA: {
    itcps: ee.Image.constant([-0.0095, -0.0016, -0.0022, -0.0021, -0.0030, 0.0029]).multiply(10000),
    slopes: ee.Image.constant([0.9785, 0.9542, 0.9825, 1.0073, 1.0171, 0.9949])
  }
};

function oli2tm(oli) {
  return oli.select(['B2','B3','B4','B5','B6','B7'])
    .subtract(harmonizeLine.oliTmTMA.itcps)
    .divide(harmonizeLine.oliTmTMA.slopes);
}

function tm2oli(tm) {
  return tm.select(['B2','B3','B4','B5','B6','B7'])
    .multiply(harmonizeLine.oliTmTMA.slopes)
    .add(harmonizeLine.oliTmTMA.itcps);
}

function harmonize(img){
  img = sr_standardizeBands(img);
  var isLC08 = ee.Algorithms.IsEqual(img.get('SATELLITE'), ee.String('LANDSAT_8'));
  
  var dat = ee.Image(ee.Algorithms.If(
    props.harmonizeTo == 'LC08',
    ee.Algorithms.If(
      isLC08,
      img.select(['B2','B3','B4','B5','B6','B7']),
      tm2oli(img)
    ),
    ee.Algorithms.If(
      isLC08,
      oli2tm(img),
      img.select(['B2','B3','B4','B5','B6','B7'])
    )
  ))
  .copyProperties(img)
  .set({
    'system:time_start': img.get('system:time_start'),
    'system:index': img.get('system:index'),
    'harmonized_to': props.harmonizeTo     
  });
   
  return ee.Image(dat).addBands(img.select('pixel_qa')).toShort(); // adding pixel_qa here so that it does not get resampled by bicubic or bilinear - tested this and it is working - if pixel_qa is selected with the other bands and resampled it is junk?
}


// #######################################################################################
// ###### MASKING ########################################################################
// #######################################################################################

function maskCFmask(img){
  if(props.cfmask.length !== 0){
    var mask = ee.Image(1);
    var qa = img.select('pixel_qa'); 
    if(props.cfmask.indexOf('water') != -1){mask = qa.bitwiseAnd(4).eq(0).multiply(mask)}
    if(props.cfmask.indexOf('shadow') != -1){mask = qa.bitwiseAnd(8).eq(0).multiply(mask)} 
    if(props.cfmask.indexOf('snow') != -1){mask = qa.bitwiseAnd(16).eq(0).multiply(mask)}
    if(props.cfmask.indexOf('cloud') != -1){mask = qa.bitwiseAnd(32).eq(0).multiply(mask)}
    if(props.cfmask.indexOf('jmask') != -1){console.log("jmask")}
    return img.updateMask(mask);  // TODO - do we need to mask img margins that do not have all bands?
  } else{
    return img;
  }
}


// maskAux1 helper
function getDifFromNorm(img, band, norm, stdev){
  return img.select(band).subtract(norm).divide(stdev);
}

function maskAux1(img){
  // assumes that images are landsat 8 bands - should check - and do so or warn
  
  var swir1Norm = ee.Image(props.maskAux1.swir1NormPath),
      blueNorm = ee.Image(props.maskAux1.blueNormPath),
      swir1Stdev = ee.Image(props.maskAux1.swir1StdevPath).divide(10),
      blueStdev = ee.Image(props.maskAux1.blueStdevPath).divide(10);

  // if not harmonized it should be - check metadata to see, if not, then do so - need to default the norm and stdev maker to harmonize
  
  // should images have fmask applied already? don't want to force it to - this should be independent

  // get dif from norm relative to stdev
  var maskSwir1 = getDifFromNorm(img, 'B6', swir1Norm, swir1Stdev).lt(props.maskAux1.swir1DifLimit)
                                                                   .and(img.select('B6')
                                                                   .lt(props.maskAux1.swir1ReflLimit))
                                                                   .not();
  var maskBlue = getDifFromNorm(img, 'B2', blueNorm, blueStdev).gt(props.maskAux1.blueDifLimit)
                                                               .and(img.select('B2')
                                                               .gt(props.maskAux1.blueReflLimit))
                                                               .not();
  // combine the masks
  var auxMask = maskSwir1.multiply(maskBlue).unmask(0);
  return img.updateMask(auxMask);
}

function maskBuffer(img){
  var mask = img.select(0).mask().not();
  var kernel = ee.Kernel.circle({radius:props.maskBuffer, units:'meters', normalize:false, magnitude:1});
  var convolvedMask = mask.convolve(kernel).not();
  return img.updateMask(convolvedMask);
}

// #######################################################################################
// ###### COLLECTION ASSEMBLY ############################################################
// #######################################################################################

function getDOY(img){
  return ee.Number(ee.Date(ee.Image(img).get('system:time_start')).getRelative('day', 'year'));
}

function getNumericMonthDay(date){
  var month = parseInt(date.slice(0, 2));
  var day = parseInt(date.slice(3, 5));
  return {month:month, day:day};
}


function sr_resample(img){
  var refl = img.select(['B[0-9]*']);
  var qa = img.select(['[^B]*']);
  var resamp = refl.resample(props.resample);
  return resamp.addBands(qa);
}

function filterCollectionByDate(year){
  var start = ee.Date.fromYMD(year, props.startDateInt.month, props.startDateInt.day);
  start = ee.Algorithms.If(props.interYear, start.advance(-1,'year'), start);
  var end = ee.Date.fromYMD(year, props.endDateInt.month, props.endDateInt.day);
  var col = ee.ImageCollection(props.ltCol) // TODO: does this need to be cast as an ee.ImageCollection
    .filterBounds(props.aoi)
    .filterDate(start, end)
    .map(function(img){
      return img.set({
        'composite_year':year,
        'sensing_year':ee.Number.parse(ee.Date(img.get('system:time_start')).format('yyyy')),
        'filler':'no'
      });
    });
  return col.toList(col.size().add(1));  // NOTE: need to add 1 in case the col is empty - can't have 0 as arg to toList
}

function sr_standardizeBands(img){
  return ee.Image(
    ee.Algorithms.If(
      ee.Algorithms.IsEqual(img.get('bands'), ee.String('standardized')),
      img,
      ee.Image(ee.Algorithms.If(
        ee.Algorithms.IsEqual(img.get('SATELLITE'), ee.String('LANDSAT_8')),
        img.select(['B2','B3','B4','B5','B6','B7','pixel_qa']),
        img.select(['B1', 'B2', 'B3', 'B4', 'B5', 'B7','pixel_qa'], ['B2','B3','B4','B5','B6','B7','pixel_qa'])
      ))
      .set({'bands':'standardized', 'band_names':'LC08'})
    )
  );
}

function sr_initBandMetadata(img){
  var isL8 = ee.Algorithms.If(
    ee.Algorithms.IsEqual(img.get('SATELLITE'), ee.String('LANDSAT_8')),
    'LC08',
    '!LC08'
  );
  return img.set({
    'bands':'original', 
    'band_names':isL8, 
    'harmonized_to': 'null',
    'topo_correction': 'null',
    'doy': getDOY(img)
  });
}

function fillCol457(year){
  var bnames = ["B1","B2","B3","B4","B5","B6","B7","sr_atmos_opacity","sr_cloud_qa","pixel_qa","radsat_qa"];
  var imgProps = {
    'composite_year':year,
    'SATELLITE':'!LC08',
    'system:time_start':ee.Date.fromYMD(year, 1, 1).millis(),
    'filler':'yes'
  };
  var img = ee.Image([0,0,0,0,0,0,0,0,0,0,0]).rename(bnames).mask(ee.Image(0)).set(imgProps);
  return ee.ImageCollection(img);
}

function fillCol8(year){
  var bnames = ["B1","B2","B3","B4","B5","B6","B7","B10","B11","sr_aerosol","pixel_qa","radsat_qa"];
  var imgProps = {
    'composite_year':year,
    'SATELLITE':'LC08',
    'system:time_start':ee.Date.fromYMD(year, 1, 1).millis(),
    'filler':'yes'
  };
  var img = ee.Image([0,0,0,0,0,0,0,0,0,0,0,0]).rename(bnames).mask(ee.Image(0)).set(imgProps);
  return ee.ImageCollection(img);
}

function sr_gather(year) {
  var years = ee.List.sequence(props.startYear, props.endYear);
  var checkEmpty = false;
  if(typeof year !== 'undefined'){
    years = ee.List([year]);
    checkEmpty = true;
  } else {
    year = 2000; // NOTE: this is weird - need a dummy here - the if below evaluates it, but does not actually use it
  }
  
  var imgList = ee.List([]);
  var l5 = false;
  var l7 = false;
  var l8 = false;
  
  if(props.sensors.indexOf('LT05') != -1){
    l5 = true;
    props.ltCol = 'LANDSAT/LT05/C01/T1_SR';
    imgList = imgList.cat(years.map(filterCollectionByDate));
  }
  if(props.sensors.indexOf('LE07') != -1){
    l7 = true;
    props.ltCol = 'LANDSAT/LE07/C01/T1_SR';
    imgList = imgList.cat(years.map(filterCollectionByDate));
  }
  if(props.sensors.indexOf('LC08') != -1){
    l8 = true;
    props.ltCol = 'LANDSAT/LC08/C01/T1_SR';
    imgList = imgList.cat(years.map(filterCollectionByDate));
  }
  
  var col = ee.ImageCollection(imgList.flatten());
  var l57 = (l5 === true || l7 === true);
  col = ee.ImageCollection(ee.Algorithms.If(checkEmpty,
    ee.Algorithms.If(col.size().eq(0),
      ee.Algorithms.If(l57, fillCol457(year), fillCol8(year)),
      col
    ),
    col
  ));
    
  /*  
  if(checkEmpty){
    ee.Algorithms.If(col.size().eq(0)
    )
    if(col.size().getInfo() === 0){  
      if(l5 === true || l7 === true){
        col = fillCol457(year);
      } else if(l8 === true){
        col = fillCol8(year);
      }
    }
  }
  */
  col = col.map(sr_initBandMetadata);
  
  if((l5 === true || l7 === true) && l8 === true){
    col = col.map(sr_standardizeBands);
  }
  
  return col;
}

function removeSLCoff(col){
  return col.filter(ee.Filter.and(ee.Filter.eq('SATELLITE', 'LANDSAT_7'), ee.Filter.gt('SENSING_TIME', '2003-06-01T00:00')).not());
}


function removeImage(id, col){
  return ee.ImageCollection(col).filter(ee.Filter.neq('system:index', ee.String(id)));
}

function removeImageList(col){
  var excludeList = ee.List(props.exclude);
  return ee.ImageCollection(ee.List(props.exclude).iterate(removeImage, col));
}

function removeImageFiller(col){
  return col.filter(ee.Filter.eq('filler', 'no'));
}


// #######################################################################################
// ###### QUALITY ASSESSMENT #############################################################
// #######################################################################################

function countValid(col){
  return col.select([0]).count().rename(['n_valid_pixels']);
}

function getFilmstrip(col){
  print('Filmstrip Thumb URL (click):');
  print(col.getFilmstripThumbURL({
    dimensions: 500,
    region: props.aoi,
    format:'png'
  }));
}


// #######################################################################################
// ###### IN PROGRESS ####################################################################
// #######################################################################################



function maskOutliers(collection, band, outlierThresh){
  var col = collection.select(band);
  
  var colMean = col.reduce(ee.Reducer.mean());
  var colStdDev = ee.Algorithms.If(
    outlierThresh == 1, 
    col.reduce(ee.Reducer.stdDev()),
    col.reduce(ee.Reducer.stdDev()).multiply(outlierThresh)  
  );
  
  var plus = colMean.add(colStdDev);
  var minus = colMean.subtract(colStdDev);
  
  var colMeanTrim = col.map(function(img){
    var mask = img.gt(minus).and(img.lt(plus));
    return img.updateMask(mask);
  });
  
  return colMeanTrim;
}

// #######################################################################################
// ###### VISUALIZATION ##################################################################
// #######################################################################################

// ------ helpers ------
function setVisMetadata(img){
  // TODO: check if we can just call copyprops for non-system props
  return {
    'composite_year':img.get('composite_year'),
    'filler':img.get('filler'),
    'harmonized_to':img.get('harmonized_to'),
    'topo_correction':img.get('topo_correction'),
    'system:index':img.get('system:index'),
    'system:time_start':img.get('system:time_start'),
    //'system:annotations':['test',10,10]
  };
}
// ---------------------

// TODO: make sure we like the stretch of these
function sr_visualize764(img){
  img = getLC08bands(img);
  return img.visualize({
    bands: ['B7', 'B6', 'B4'],
    min: [0, 100, 0],
    max: [3696, 4500, 2500],
    gamma: [1, 1, 1]
  }).set(setVisMetadata(img));
}

function sr_visualize754(img){
  img = getLC08bands(img);
  return img.visualize({
    bands: ['B7', 'B5', 'B4'],
    min: [-904, 151, -300],
    max: [3696, 4951, 2500],
    gamma: [1, 1, 1]
  }).set(setVisMetadata(img));
}

function sr_visualize654(img){
  img = getLC08bands(img);
  return img.visualize({
    bands: ['B6', 'B5', 'B4'],
    min: [100,151,0],
    max: [4500,4951,2500],
    gamma: [1, 1, 1]
  }).set(setVisMetadata(img));
}

function sr_visualize543(img){
  img = getLC08bands(img);
  return img.visualize({
    bands: ['B5', 'B4', 'B3'],
    min: [151, 0, 50],
    max: [4951, 2500, 2500],
    gamma: [1, 1, 1]
  }).set(setVisMetadata(img));
}

function sr_visualize432(img){
  img = getLC08bands(img);
  return img.visualize({
    bands: ['B4', 'B3', 'B2'],
    min: [0, 50, 50],
    max: [2500, 2500, 2500],
    gamma: [1, 1, 1]
  }).set(setVisMetadata(img));
}

function sr_visualize564(img){
  img = getLC08bands(img);
  return img.visualize({
    bands: ['B5', 'B6', 'B4'],
    min: [151, 100, 0],
    max: [4951, 4500, 2500],
    gamma: [1, 1, 1]
  }).set(setVisMetadata(img));
}

function sr_visualizeTC(img){
  return img.visualize({
    bands: ['TCB', 'TCG', 'TCW'],
    min: [604, -49, -2245],
    max: [5592, 3147, 843],
    gamma: [1, 1, 1]
  }).set(setVisMetadata(img));
}

var sr_visParams = {
  visTC:{
    bands: ['TCB', 'TCG', 'TCW'],
    min: [604, -49, -2245],
    max: [5592, 3147, 843],
    gamma: [1, 1, 1]
  },
  vis764:{
    bands: ['B7', 'B6', 'B4'],
    min: [0, 100, 0],
    max: [3696, 4500, 2500],
    gamma: [1, 1, 1]    
  },
  vis754:{
    bands: ['B7', 'B5', 'B4'],
    min: [0, 151, 0],
    max: [3696, 4951, 2500],
    gamma: [1, 1, 1]
  },
  vis654:{
    bands: ['B6', 'B5', 'B4'],
    min: [100,151,0],
    max: [4500,4951,2500],
    gamma: [1, 1, 1]
  },
  vis543:{
    bands: ['B5', 'B4', 'B3'],
    min: [151, 0, 50],
    max: [4951, 2500, 2500],
    gamma: [1, 1, 1]
  },
  vis432:{
    bands: ['B4', 'B3', 'B2'],
    min: [0, 50, 50],
    max: [2500, 2500, 2500],
    gamma: [1.4, 1.4, 1.4]
  },
  vis564:{
    bands: ['B5', 'B6', 'B4'],
    min: [151, 100, 0],
    max: [4951, 4500, 2500],
    gamma: [1, 1, 1]
  }
};






// #######################################################################################
// ###### MOSAIC #########################################################################
// #######################################################################################

// ------ helpers ------
function sr_removeBandCFmask(img){ // TODO: add this to the exports - possibly make it remove all qa bands
  return img.select(img.bandNames().filter(ee.Filter.neq('item', 'pixel_qa')));
}

function setMosaicMetadata(img){
  var yearString = ee.Algorithms.String(img.get('composite_year')).slice(0,4);
  var yearInt = ee.Number.parse(yearString);
  return {
    'filler': img.get('filler'),
    'band_names': img.get('band_names'),
    'composite_year': yearInt,
    'harmonized_to': img.get('harmonized_to'),
    'system:index': yearString,
    'system:time_start': ee.Date.fromYMD(yearInt, props.compDateInt.month, props.compDateInt.day).millis()
  };
}

function setdistinctPath(img){
  var path = ee.String('000').cat(ee.String(ee.Number(img.get('WRS_PATH')).toShort())).slice(-3);
  var ymd = ee.Date(img.get('system:time_start')).format('YYYYMMdd');
  var distPath = path.cat(ee.String('_').cat(ymd));
  return ee.Image(img.set({'distinct_path': distPath}));
}

function getMediod(col){
  var median = col.median();
  var difFromMedian = col.map(function(img) {
    var dif = ee.Image(img).subtract(median).pow(ee.Image.constant(2));
    return dif.reduce(ee.Reducer.sum()).addBands(img).copyProperties(img, ['system:time_start']);
  }).map(function(img) {
    var doy = ee.Date(ee.Image(img).get('system:time_start')).getRelative('day', 'year');
    var doyImg = ee.Image(doy).rename('DOY').toShort();
    return img.addBands(doyImg);
  });
  var bandNames = difFromMedian.first().bandNames();
  var len = bandNames.length();
  var bandsPos = ee.List.sequence(1, len.subtract(1));
  var bandNamesSub = bandNames.slice(1);
  return difFromMedian.reduce(ee.Reducer.min(len)).select(bandsPos,bandNamesSub);
}

function addDOYtrgtDif(img){
  var dif = ee.Number(img.get('doy')).subtract(ee.Number(props.doyTarget)).abs();
  return img.set('doy_target_dif', dif);
}

function addDOYband(img){
  var doyBand = ee.Image(ee.Number(img.get('doy')))
    .updateMask(img.select(0).mask())
    .toShort().rename('DOY');
  return img.addBands(doyBand);
}
// ---------------------

function sr_mosaicMean(col){ // TODO: check calculation 
  return col.map(sr_removeBandCFmask)
    .reduce(ee.Reducer.mean())
    .set(setMosaicMetadata(col.first()))
    .rename(sr_removeBandCFmask(col.first()).bandNames());
}

function sr_mosaicMedian(col){ // TODO: check calculation
  return col.map(sr_removeBandCFmask)
    .reduce(ee.Reducer.median())
    .set(setMosaicMetadata(col.first()))
    .rename(sr_removeBandCFmask(col.first()).bandNames());
}

function sr_mosaicMin(col){ // TODO: check calculation 
  return col.map(sr_removeBandCFmask)
    .reduce(ee.Reducer.min())
    .set(setMosaicMetadata(col.first()))
    .rename(sr_removeBandCFmask(col.first()).bandNames());
}

function sr_mosaicMax(col){ // TODO: check calculation 
  return col.map(sr_removeBandCFmask)
    .reduce(ee.Reducer.max())
    .set(setMosaicMetadata(col.first()))
    .rename(sr_removeBandCFmask(col.first()).bandNames());
}

function ls_mosaicPath(col){  // TODO: need to add year composite etc
  col = col.map(setdistinctPath);
  var di = ee.ImageCollection(col.distinct(['distinct_path']));
  var date_eq_filter = ee.Filter.equals({leftField: 'distinct_path', rightField: 'distinct_path'});
  var saveall = ee.Join.saveAll('to_mosaic');
  var ji = ee.ImageCollection(saveall.apply(di, col, date_eq_filter));
  var m = ji.map(function(img) {
    return ee.ImageCollection.fromImages(img.get('to_mosaic')).mosaic().set({'distinct_path': img.get('distinct_path')});
  });
  return m;
}

function sr_mosaicMedoid(col){
  col = col.map(sr_removeBandCFmask);
  return getMediod(col).set(setMosaicMetadata(col.first())); // TODO: check years and dates
}

function sr_mosaicDOY(col){
  col = col.map(sr_removeBandCFmask)
    .map(addDOYtrgtDif)
    .map(LC08_038029_20150701'))
   .set({'composite_year': 2015, 'sensing_year': 2015, 'filler':'no'});
}

function sr_getLT05col(){
  return ee.ImageCollection('LANDSAT/LT05/C01/T1_SR')
    .filterDate('2000-07-01', '2000-09-01')
    .filterBounds(ee.Geometry.Point([-110.34, 44.45]))
    .map(sr_initBandMetadata)
    .map(function(img){return img.set({'composite_year': 2000, 'sensing_year': 2000, 'filler':'no'})});
}

function sr_getLE07col(){
  return ee.ImageCollection('LANDSAT/LE07/C01/T1_SR')
    .filterDate('2005-07-01', '2005-09-01')
    .filterBounds(ee.Geometry.Point([-110.34, 44.45]))
    .map(sr_initBandMetadata)
    .map(function(img){return img.set({'composite_year': 2005, 'sensing_year': 2005, 'filler':'no'})});
}

function sr_getLC08col(){
  return ee.ImageCollection('LANDSAT/LC08/C01/T1_SR')
    .filterDate('2015-07-01', '2015-09-01')
    .filterBounds(ee.Geometry.Point([-110.34, 44.45]))
    .map(sr_initBandMetadata)
    .map(function(img){return img.set({'composite_year': 2015, 'sensing_year': 2015, 'filler':'no'})});
}

function sr_getL578col(){
  return ee.ImageCollection([
    ee.Image('LANDSAT/LT05/C01/T1_SR/LT05_038029_20000707').set({'composite_year': 2000, 'sensing_year': 2000, 'filler':'no'}),
    ee.Image('LANDSAT/LE07/C01/T1_SR/LE07_038029_20050814').set({'composite_year': 2005, 'sensing_year': 2005, 'filler':'no'}),
    ee.Image('LANDSAT/LC08/C01/T1_SR/LC08_038029_20150701').set({'composite_year': 2015, 'sensing_year': 2015, 'filler':'no'})
  ]).map(sr_initBandMetadata);
}

// #######################################################################################
// ###### INDEX CALCULATION FUNCTIONS ####################################################
// #######################################################################################

var tcTransform = function(img){ 
  var origImg = img;
  img = getLC08bands(img);
  var b = ee.Image(img).select(["B2", "B3", "B4", "B5", "B6", "B7"]);
  var brt_coeffs = ee.Image.constant([0.2043, 0.4158, 0.5524, 0.5741, 0.3124, 0.2303]);
  var grn_coeffs = ee.Image.constant([-0.1603, -0.2819, -0.4934, 0.7940, -0.0002, -0.1446]);
  var wet_coeffs = ee.Image.constant([0.0315, 0.2021, 0.3102, 0.1594, -0.6806, -0.6109]);
  
  var sum = ee.Reducer.sum();
  var brightness = b.multiply(brt_coeffs).reduce(sum);
  var greenness = b.multiply(grn_coeffs).reduce(sum);
  var wetness = b.multiply(wet_coeffs).reduce(sum);
  var angle = (greenness.divide(brightness)).atan().multiply(180/Math.PI).multiply(100);
  var tc = brightness.addBands(greenness)
    .addBands(wetness)
    .addBands(angle)
    .select([0,1,2,3], ['TCB','TCG','TCW','TCA']); // TODO: could probably use rename here
  return origImg.addBands(tc);
};

var nbrTransform = function(img) {
  var origImg = img;
  img = getLC08bands(img).normalizedDifference(['B5', 'B7']).rename(['NBR']);
  return origImg.addBands(img);
};

function ndviTransform(img){
  var origImg = img;
  img = getLC08bands(img).normalizedDifference(['B5', 'B4']).rename(['NDVI']);
  return origImg.addBands(img);
}
                
function ndsiTransform(img){ 
  var origImg = img;
  img = getLC08bands(img).normalizedDifference(['B3', 'B6']).rename(['NDSI']);
  return origImg.addBands(img);
}

function ndmiTransform(img) {
  var origImg = img;
  img = getLC08bands(img).normalizedDifference(['B5', 'B6']).rename(['NDMI']);
  return origImg.addBands(img);
}

function ndgrTransform(img) {
  var origImg = img;
  img = getLC08bands(img).normalizedDifference(['B3', 'B4']).rename(['NDGR']);
  return origImg.addBands(img);
}


function getLC08bands(img){
  return ee.Image(ee.Algorithms.If(
    ee.Algorithms.IsEqual(img.get('band_names'), ee.String('LC08')),
    img.select(['B2','B3','B4','B5','B6','B7']),
    img.select(['B1', 'B2', 'B3', 'B4', 'B5', 'B7'], ['B2','B3','B4','B5','B6','B7'])
  ));
}


// #######################################################################################
// MINNAERT TOPO CORRECTION ##############################################################
// ###########################################################################ain.select(['slope'])).resample('bicubic');
  var aspect = radians(terrain.select(['aspect'])).resample('bicubic');
  var azimuth = radians(ee.Image.constant(args.azimuth));
  var zenith = radians(ee.Image.constant(args.zenith));
  var left = zenith.cos()
                   .multiply(slope.cos());
  var right = zenith.sin()
                   .multiply(slope.sin())
                   .multiply(azimuth.subtract(aspect).cos()); 
  return left.add(right).resample('bicubic');
}

// function to make Minnaert coefficient image per given Landsat band
function getKimg(){
  // define polynomial coefficients to calc Minnaert value as function of slope
  // Ge, H., Lu, D., He, S., Xu, A., Zhou, G., & Du, H. (2008). Pixel-based Minnaert correction method for reducing topographic effects on a Landsat 7 ETM+ image. Photogrammetric Engineering & Remote Sensing, 74(11), 1343-1350. | https://orst.library.ingentaconnect.com/content/asprs/pers/2008/00000074/00000011/art00003?crawler=true&mimetype=application/pdf
  var kPolyCoefs = ee.Dictionary({ // these have been reversed from Fig. 4
    "B2": [0.9955046347,-0.1107874514,0.0060353467,-0.000139425,0.0000011256],
    "B3": [1.4038672968,-0.1660369464,0.0094389685,-0.0002224522,0.0000018168],
    "B4": [1.7297781997,-0.2104072261,0.0119868502,-0.0002844382,0.0000023443],
    "B5": [1.0021313684,-0.1308793751,0.0106861276,-0.0004051135,0.0000071825,-4.88e-8],
    "B6": [1.3313675208,-0.1857263329,0.014950102,-0.0005601872,0.0000098744,-6.69e-8],
    "B7": [1.7780447207,-0.2540062618,0.01957206,-0.0007159317,0.0000124497,-8.37e-8]
  });
  
  var dem = ee.Image(props.demMinnaert);
  var slope = ee.Algorithms.Terrain(dem).select(['slope']).resample('bicubic');
  slope = slope.where(slope.gt(50), 50); // set max slope at 50 degrees - paper does not sample past - authors recommend no extrapolation
  var bnames = kPolyCoefs.keys();
  var kImgList = bnames.map(function(band){
    return slope.polynomial(kPolyCoefs.get(band)).set('band',band);
  });
  
  return ee.ImageCollection.fromImages(kImgList)
    .sort('band')
    .toBands()
    .rename(bnames);
}

/*
function to apply Minnaert Correction - basically just wraps previous functions - if you are going
to map this on a collection - this function needs to be redone a little as an anonymous function 
when calling .map() so that you can define the dem argument (if you wish - there is also a default), 
as well as supplying the image - for this toy example it is not being mapped
*/
function topoCorrMinnaert(img){
  img = sr_standardizeBands(ee.Image(img));
  var origImg = img;
  var bNames = img.select(['B[2-7]']).bandNames();
  img = img.select(bNames);
  var solPos = getSolarPosition(img);
  var ic = getIllumination({azimuth:solPos.azimuth, zenith:solPos.zenith});
  var cosTheta = radians(ee.Image.constant(solPos.zenith)).cos();
  var correction = (cosTheta.divide(ic)).pow(getKimg());
  return ee.Image(img.multiply(correction).round().toShort()
    .addBands(origImg.select(['[^B]*']))
    .copyProperties(origImg)
    .set({
      'topo_correction': 'minnaert',
      'system:time_start': origImg.get('system:time_start'),
      'system:index': origImg.get('system:index'),
    }));
}

// #######################################################################################
// ###### PROPS ##########################################################################
// #######################################################################################

function setProps(userProps){    
  // TODO: warn if nothing is passed
  props.startYear = userProps.startYear || props.startYear;
  props.endYear = userProps.endYear || props.endYear;
  props.startDate = userProps.startDate || props.startDate;
  props.endDate = userProps.endDate || props.endDate;
  props.cfmask = userProps.cfmask || props.cfmask;
  props.sensors = userProps.sensors || props.sensors;
  props.harmonizeTo = userProps.harmonizeTo || props.harmonizeTo;
  props.exclude = userProps.exclude || props.exclude;
  props.compositeDate = userProps.compositeDate || props.compositeDate;
  props.doyTarops.maskAux1.swir1NormPath = userProps.maskAux1.swir1NormPath || props.maskAux1.swir1NormPath;
    props.maskAux1.blueNormPath = userProps.maskAux1.blueNormPath || props.maskAux1.blueNormPath;
    props.maskAux1.swir1StdevPath = userProps.maskAux1.swir1StdevPath || props.maskAux1.swir1StdevPath;
    props.maskAux1.blueStdevPath = userProps.maskAux1.blueStdevPath || props.maskAux1.blueStdevPath;
    props.maskAux1.swir1DifLimit = userProps.maskAux1.swir1DifLimit || props.maskAux1.swir1DifLimit;
    props.maskAux1.blueDifLimit = userProps.maskAux1.blueDifLimit || props.maskAux1.blueDifLimit;
    props.maskAux1.swir1ReflLimit = userProps.maskAux1.swir1ReflLimit || props.maskAux1.swir1ReflLimit;
    props.maskAux1.blueReflLimit =userProps.maskAux1.blueReflLimit || props.maskAux1.blueReflLimit;
  }
  if(props.printProps) {
    print('Collection Properties:');
    print(props);
  }
  return props;
}


// #######################################################################################
// ###### EXPORTS ########################################################################
// #######################################################################################

exports.sr = {
  'gather':           sr_gather,
  'resample':         sr_resample,
  'harmonize':        harmonize,
  'maskCFmask':       maskCFmask,
  'maskAux1':         maskAux1,        // TODO: add this to the docs
  'maskBuffer':       maskBuffer,
  'getLT05img':       sr_getLT05img,
  'getLE07img':       sr_getLE07img,
  'getLC08img':       sr_getLC08img,
  'getLT05col':       sr_getLT05col,
  'getLE07col':       sr_getLE07col,
  'getLC08col':       sr_getLC08col,
  'getL578col':       sr_getL578col,
  'addBandTC':        tcTransform,  
  'addBandNBR':       nbrTransform,
  'addBandNDVI':      ndviTransform,
  'addBandNDSI':      ndsiTransform,
  'addBandNDMI':      ndmiTransform,
  'addBandNDGR':      ndgrTransform,
  'visualize764':     sr_visualize764, // TODO: add this to the docs
  'visualize754':     sr_visualize754,
  'visualize654':     sr_visualize654,
  'visualize543':     sr_visualize543,
  'visualize432':     sr_visualize432,
  'visualize564':     sr_visualize564, // TODO: add this to the docs
  'visualizeTC':      sr_visualizeTC,
  'mosaicMean':       sr_mosaicMean,
  'mosaicMedian':     sr_mosaicMedian,
  'mosaicMin':        sr_mosaicMin,
  'mosaicMax':        sr_mosaicMax,
  'mosaicMedoid':     sr_mosaicMedoid,
  'mosaicDOY':        sr_mosaicDOY,
  'removeBandCFmask': sr_removeBandCFmask,
  'removeSLCoff':     removeSLCoff,
  'removeImageList':  removeImageList,
  'removeImageFiller':removeImageFiller,
  'standardizeBands': sr_standardizeBands,
  'countValid':       countValid,
  'getFilmstrip':     getFilmstrip,
  'visParams':        sr_visParams,
  'maskOutliers':     maskOutliers,
  'topoCorrMinnaert': topoCorrMinnaert
};

exports.ls = {
  'mosaicPath':         ls_mosaicPath
};

exports.props = props;

exports.setProps = setProps;


