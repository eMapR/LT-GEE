![banner image](https://github.com/eMapR/LT-GEE/blob/master/imgs/lt_gee_symbols_small.png)

# **LT-GEE**

**LandTrendr (Landsat-based detection of trends in disturbance and recovery) 
implementation in the Google Earth Engine platform**

Jump right into an **[example](#changemap)** of disturbance mapping

## Sections
+ [Introduction](#introduction)
+ [LandTrendr](#landtrendr)
+ [LT-GEE Requirements](#requirements)
+ [Running LT-GEE](#runninglt)
+ [LT-GEE Outputs](#ltgeeoutputs)
+ [Example Scripts](#examples)
+ [Function Documentation](#documentation)
+ [FAQ](#faq)
+ [References](#references)

## <a id='introduction'></a>Introduction

LandTrendr is set of spectral-temporal segmentation algorithms that are useful 
for change detection in a time series of moderate resolution satellite imagery (primarily Landsat) 
and for generating trajectory-based spectral time series data largely absent of 
inter-annual signal noise. LandTrendr was originally implemented in IDL 
(Interactive Data Language), but with the help of engineers at Google, it has 
been ported ([paper](https://github.com/eMapR/LT-GEE/blob/master/docs/kennedy_etal_2018_lt-gee.pdf)) to the Google Earth Engine (GEE) platform 
([overview](https://earthengine.google.com/), [paper](https://github.com/eMapR/LT-GEE/blob/master/docs/gorelick_etal_2017_google_earth_engine.pdf)). 
The GEE framework nearly eliminates the onerous data management and image-preprocessing 
aspects of the IDL implementation. It is also light-years faster than the IDL 
implementation, where computing time is measured in minutes instead of days.

This guide is intended to introduce the basics of running LandTrendr in GEE. 
It describes the LandTrendr conceptual framework, what is required to run LT-GEE, how to run it, what the outputs are and how they are formatted, and provides three example scripts. It is assumed that you have a 
[GEE account](https://signup.earthengine.google.com/#!/), that you are 
somewhat familiar with the [GEE JavaScript API](https://developers.google.com/earth-engine/), 
and have a basic understanding of LandTrendr 
([method](https://github.com/eMapR/LT-GEE/blob/master/docs/kennedy_etal_2010_landtrendr.pdf), 
[application](https://github.com/eMapR/LT-GEE/blob/master/docs/kennedy_etal_2012_disturbance_nwfp.pdf)).

## <a id='landtrendr'></a>LandTrendr

Each pixel in an image time series has a story to tell, LandTrendr aims to tell them succinctly. Let's look at an example; here we have a pixel intersecting Lon: -123.845, Lat: 45.889 (Fig 1) from a conifer-dominated,
industrial forest region of the Pacific Northwest, USA. At the
beginning of its record, it was a mature, second-growth conifer stand, and for 17 years, little changed.
Then, between the summers of 2000 and 2001 a service road was built through it, removing some of its vegetation. 
Over the next year it experienced a clearcut harvest, removing all of its remaining
vegetation. For the last 14 years it has been regenerating. Most
recently it was a closed canopy, maturing, conifer stand.

![pixel story](https://github.com/eMapR/LT-GEE/blob/master/imgs/pixel_story.jpg)
*Fig 1. Every pixel tells a story. Landsat provides a historical record of the character of landscapes. By
extracting a single pixel from a time series of Landsat imagery, it is possible to recount the state and change of 
the features composing the 1-hectare area of a pixel through time. In this example, we analyze the history of a conifer 
forest pixel from an industrial forest region of the Pacific Northwest (USA) that experiences a period of relative stability,
a dramatic, rapid loss of vegetation, and subsequent regeneration.*
<br><br>

The description of this example pixel's history is of course abridged, and only conveys a moderate resolution perspective of state and change in forest character. The unabridged version of this pixel's story includes many other small changes in the forest stand it represents, but given 
the precision of the satellite sensor and errors in processing, the provided description is the type of pixel history interpretation we are 
confident are represented well in the image time series. LandTrendr is a brevity algorithm that listens to the annual, verbose, noisy detail of a pixel's story and writes an abridged version.

In practice, LandTrendr takes a single point-of-view from a pixel's spectral history, like a band or an index, and goes 
through a process to identify breakpoints separating periods of durable change in spectral trajectory, and records the year that changes 
occurred. These breakpoints, defined by year and spectral index value, allow us to represent the spectral history of a 
pixel as a series of vertices bounding line segments (Fig 2).

![segmentation](https://github.com/eMapR/LT-GEE/blob/master/imgs/segmentation.png)
*Fig 2. LandTrendr pixel time series segmentation. Image data is reduced to a single band or spectral index and then 
divided into a series of straight line segments by breakpoint (vertex) identification.*
<br><br>

There are two neat features that result from this segmented view of spectral history.

1. The ability to interpolate new values for years between vertices.
2. Simple geometry calculations on line segments provide information about distinct spectral epochs

### Fit-to-vertex Image Data

The ability to interpolate new values for years between vertices is very useful. It ensures that each observation is aligned 
to a trajectory consistent with where the pixel has been and where it is going. We can think of this as hindsight-enhanced image 
time series data. It has two practical utilities. It can fill in data from missing observations in the time series (masked because 
of cloud or shadow) and it maintains consistency in predictive mapping through time; e.g. an annual forest classification is not 
likely to bounce between mature and old-growth conifer because of minor differences in spectral reflectance from atmosphere or 
shadow difference (Fig 3).

![seg index ftv](https://github.com/eMapR/LT-GEE/blob/master/imgs/seg_index_ftv.png)
*Fig 3. Hindsight-enhanced image time series data. Identification of time series breakpoints or vertices, allows the observations 
between vertices to be interpolated, removing extraneous information and placing each observation in the context of the trajectory 
it is part of. This is useful in filling missing observations because of cloud and shadow, and makes for more consistent annual 
map prediction.*
<br><br>

Since breakpoints or vertices are defined by a year we also have the ability to impose breakpoints identified in one spectral band 
or index on any other. For instance, we can segment a pixel time series cast as Normalized Burn Ratio (NBR: [NIR-SWIR]/[NIR+SWIR]) 
to identify vertices, and then segment a short-wave infrared (SWIR) band based on the NBR-identified vertices (Fig 4).  

![other index ftv](https://github.com/eMapR/LT-GEE/blob/master/imgs/other_index_ftv.png)
*Fig 4. Impose the segmentation structure of one spectral representation on another. Here we have identified four breakpoints or 
vertices for a pixel time series using NBR, and then used the year of those vertices to segment and interpolate the values of a 
SWIR band time series for the same pixel.*
<br><br>

This is useful because we can make the whole data space for a pixel’s time series consistent relative to a single perspective (Fig 5) and
summarize starting, ending, and delta values for all spectral representations for the same temporal segments, 
which can be powerful predictors of land cover, agent of change, and state transitions.

![all index ftv](https://github.com/eMapR/LT-GEE/blob/master/imgs/all_index_ftv.png)
*Fig 5. A stack of spectral representations can be standardized to the segmentation structure of a single spectral band or index. Here 
we are demonstrating the standardization of tasseled cap brightness, greenness, and wetness to the segmentation structure of NBR. 
This allows us to take advantage of multi-dimensional spectral space to describe the properties of spectral epochs and breakpoints 
to predict land cover, change process, and transitions from a consistent perspective (NBR).*
<br><br>

### Epoche Information

The second neat feature of a segmented world view of spectral history is that simple geometry calculations can summarize attributes of 
spectral epochs (Fig 6). Temporal duration and spectral magnitude can be calculated for each segment based on the vertex time and 
spectral dimensions. These attributes allow us to easily query the data about when changes occur, how frequently they occur, on 
average how long do they last, what is the average magnitude of disturbance (or recovery) segments, etc. We can also query information about 
adjacent segments to focal segments. For instance, we can ask, what it the average rate of recovery following a disturbance segment, 
or what was the trajectory of a pixel time series prior to disturbance segments that we’ve attributed to fire.    

![segment attributes](https://github.com/eMapR/LT-GEE/blob/master/imgs/segment_attributes.png)
*Fig 6. Diagram of segment attributes. From these attributes we can summarize and query change per pixel over the landscape.*
<br><br>


## <a id='requirements'></a>LT-GEE Requirements
LandTrendr for Google Earth Engine requires two things: 

1. An annual image collection 
2. A set of parameters to control segmentation

### Image Collection

The image data composing a collection needs to represent an observation that is consistent through time. It should not include noise from
atmosphere, clouds and shadows, sensor differences, or other anomalies. The annual changes in a time series should be the result of 
changes in the physical features of a landscape. We recommend using the *USGS Landsat Surface Reflectance Tier 1* datasets.
These data have been atmospherically corrected, and include a cloud, shadow, water and snow mask produced 
using CFMASK.

GEE ImageCollection IDs for USGS Landsat Surface Reflectance 

+ Landsat 5: LANDSAT/LT05/C01/T1_SR
+ Landsat 7: LANDSAT/LE07/C01/T1_SR
+ Landsat 8: LANDSAT/LC08/C01/T1_SR

The collection must include only one observation per year. However, because clouds are often present in any given image, it
is best to retrieve multiple images for a season, mask out clouds and cloud shadows from each, and then create a composite of
those images so that you have reasonable annual spatial coverage of clear-view pixels. The best-pixel-compositing method you 
apply is up to you. We have used nearness to a target day-of-year and also medoid compositing, we prefer the later and include
it in the provided [examples](#examples). LandTrendr will segment the first band in the image collection and generate annual fitted-to-vertx (FTV) data for each subsequent band. Consequently, you need to manipulate your collection so that the band or spectral index you 
want segmented is the first band, and any additional bands you want fitted to vertices should follow. The band or index you select for segmentation should
be based on an informed decision weighted by the sensitivity of it to change in the conditions of the landscape you are working with. The best spectral representation of change can be different for
shrubs vs trees vs conifers vs deciduous etc. We have found SWIR bands, and indices leveraging them, to be generally quite sensitive to change, but we also 
know that it is highly variable. You should try segmenting on several bands or indices to see what works best. We also recommend trying a few different date windows and widths for generating annual composites.

In the [example](#examples) scripts we provide, we composite image dates for the northern hemisphere growing season (mid-June through mid-September), which seems to work pretty well for 25-50 degrees latitude. Folks working in the southern hemisphere will need to modify the example scripts if you are to include images from your growing season, since it crosses the new year: December 2016 through Feburary 2017, for example. You'll also have to deal with how to label the year of the annual image composite - should it be the former or later year of the growing season composite?   

<a id='importantsteps'></a>**Two really important steps** in image collection building include 1) masking cloud and cloud shadow pixels during annual image compositing and to 2) ensure that the spectral band or index that is 
to be segmented is oriented so that vegetation loss is represented by a positive delta. For instance, NBR in its native orientation results in a negative delta when vegetation is lost from one observation to the next. In this case, NBR must be multiplied by -1 before being segmented.  

### LT parameters

The LT-GEE function takes 9 arguments: 8 control parameters that adjust how spectal-temporal segmentation is done, and the annual image collection. The original LandTrendr [paper](https://github.com/eMapR/LT-GEE/blob/master/docs/kennedy_etal_2010_landtrendr.pdf) describes the effect and sensitivity of changing some of these argument values. We recommend trying slight variations in settings to see what works best for the environment you are working in. One of the great things about having LT in GEE, is that parameter settings are easy and fast to iterate through to find a best set.

***timeSeries (ImageCollection):***

Collection from which to extract trends (it's assumed that each image in the collection represents one year). The first band is used to find breakpoints, and all subsequent bands are fitted using those breakpoints.

***maxSegments (Integer):***

Maximum number of segments to be fitted on the time series.

***spikeThreshold (Float, default: 0.9):***

Threshold for dampening the spikes (1.0 means no dampening).

***vertexCountOvershoot (Integer, default: 3):***

The inital model can overshoot the maxSegments + 1 vertices by this amount. Later, it will be prunned down to maxSegments + 1.

***preventOneYearRecovery (Boolean, default: false):***

Prevent segments that represent one year recoveries.

***recoveryThreshold (Float, default: 0.25):***

If a segment has a recovery rate faster than 1/recoveryThreshold (in years), then the segment is disallowed.

***pvalThreshold (Float, default: 0.1):***

If the p-value of the fitted model exceeds this threshold, then the current model is discarded and another one is fitted using the Levenberg-Marquardt optimizer.

***bestModelProportion (Float, default: 1.25):***

Takes the model with most vertices that has a p-value that is at most this proportion away from the model with lowest p-value.

***minObservationsNeeded (Integer, default: 6):***

Min observations needed to perform output fitting.

## <a id='runninglt'></a>Running LT-GEE

In its most most basic form, running LandTrendr in Google Earth Engine requires 6 steps. The following code snippets help illustrate the steps (dont use them - they are only a demonstration aid).

1. Define starting and ending years of the times series

```javascript
var startYear = 1985;
var endYear   = 2010;
```

2. Define an area to run LandTrendr on as an `ee.Geometry`

```javascript
var coords = [[-123.925, 42.996],
              [-122.327, 42.996],
              [-122.327, 43.548],
              [-123.925, 43.548],
              [-123.925, 42.996]];

var aoi = ee.Geometry.Polygon(coords);
```

3. Define the LandTrendr run parameters as a dictionary. See the [documentation](#documentation) section for parameter definitions

```javascript	
var run_params = { 
  maxSegments:            6,
  spikeThreshold:         0.9,
  vertexCountOvershoot:   3,
  preventOneYearRecovery: true,
  recoveryThreshold:      0.25,
  pvalThreshold:          0.05,
  bestModelProportion:    0.75,
  minObservationsNeeded:  6
};
```

4. Build an image collection that includes only one image per year subset to a single band or index (you can include other bands - the first will be segmented, the others will be fit to the vertices). Note that we are using a mock function to reduce annual image collections to a single image - this can be accomplished many ways using various best-pixel-compositing methods.

```javascript
for(var year = startYear; year <= endYear; year++) {
  var img = ee.ImageCollection('LANDSAT/LT05/C01/T1_SR')
              .filterBounds(aoi)
              .filterDate(year+'-06-15', year+'-09-15');
  
  img = reduceToSingeImageMockFunction(img);

  var tempCollection = ee.ImageCollection(img.select(['B5'])) ;         

  if(year == startYear) {
    var srCollection = tempCollection;
  } else {
    srCollection = srCollection.merge(tempCollection);
  }
};
```

5. Append the image collection to the LandTrendr run parameter dictionary

```javascript
run_params.timeSeries = srCollection;
```

6. Run the LandTrendr algorithm

```javascript    
var LTresult = ee.Algorithms.Test.LandTrendr(run_params);
```

Please note that for the sake of a basic example LT-GEE run, we are not addressing the [two really important steps](#importantsteps) in collection building: 1) to mask cloud and cloud shadow pixels during annual image compositing (step 4) and 2) to ensure that the spectral band or index that is 
to be segmented is oriented so that vegetation loss is represented by a positive delta (we used a SWIR band, which is the correct orientation for use in LT-GEE).


## <a id='ltgeeoutputs'></a>LT-GEE Outputs

The results of LT-GEE include (Fig 8):

+ The year of observations per pixel time series; x-axis values in 2-D spectral-temporal space; (default)
+ The source value of observations per pixel time series; y-axis values in 2-D spectral-temporal space; (default)
+ The source value of observations fitted to segment lines between vertices (FTV) per pixel time series; y-axis values in 2-D spectral-temporal space; (default)
+ The root mean square error (RMSE) of the FTV values, relative to the source values; (default)
+ Complete time series FTV values for additional bands in the collection greater than band 1; y-axis values in 2-D spectral-temporal space; (optional)

![lt outputs series](https://github.com/eMapR/LT-GEE/blob/master/imgs/outputs_series.png)
*Fig 8. A visual diagram of what data are returned from LT-GEE. Every legend item is returned as an output.* 
<br><br><br>



The results of LT-GEE are not immediately ready for display or export as maps of change or fitted time series data. Think of each pixel as a bundle of data that needs to be unpacked. The packaging of the data per pixel is similar to a nested list in Python or R. The primary list looks something like this:

```
[[Annual Segmentation Info], Fitting RMSE, [Fitted Time Series n]]
```

In the GEE construct, this primary list is an image with at least 2 bands, one that contains annual segmentation information and one that contains the RMSE of the segmentation fit. Additionally, if the input image collection to LT-GEE contained more than one band, then each band following the first will be represented as a spectrally fitted annual series (Fig 7).

![lt outputs](https://github.com/eMapR/LT-GEE/blob/master/imgs/lt_outputs.png)
*Fig 7. The results of LT-GEE are essentially a list of lists per pixel that describe segmentation and optionally provide fitted annual spectral data. The output is delivered as a GEE image with at least 2 bands, one that contains annual segmentation information and one that contains the RMSE of the segmentation fit. Additionally, if the input image collection to LT-GEE contained more than one band, then each band following the first will be represented as a spectrally fitted annual series.* 
<br><br><br>

### LandTrendr Band 

The 'LandTrendr' band is a 4 x nYears dimension array. You can subset it like this:

```javascript
var LTresult = ee.Algorithms.Test.LandTrendr(run_params); // run LT-GEE
var segmentationInfo = LTresult.select(['LandTrendr']); // subset the LandTrendr segmentation info
```

It contains 4 rows and as many columns as there are annual observations for a given pixel through the time series. The 2-D 'LandTrendr' annual segmentation array looks like this: 

```javascript
[
  [1985, 1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, ...] // Year list 
  [ 811,  809,  821,  813,  836,  834,  833,  818,  826,  820,  765,  827,  775, ...] // Source list
  [ 827,  825,  823,  821,  819,  817,  814,  812,  810,  808,  806,  804,  802, ...] // Fitted list
  [   1,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    1, ...] // Is Vertex list
]
```

Row 1 is the observation year.<br>
Row 2 is the observation value corresponding to the year in row 1, it is equal to the first band in the input collection.<br>
Row 3 is the observation fitted to line segments defined by breakpoint vertices identified in segmentation.<br>
Row 4 is a Boolean value indicating whether an observation was identified as a vertex.

You can extract a row using the GEE `arraySlice` function. Here is an example of the extracting the year and fitted value rows as separate lists:

```javascript
var LTresult = ee.Algorithms.Test.LandTrendr(run_params); // run LT-GEE
var LTarray = LTresult.select(['LandTrendr']); // subset the LandTrendr segmentation info
var year = LTarray.arraySlice(0, 0, 1); // slice out the year row
var fitted = LTarray.arraySlice(0, 2, 3); // slice out the fitted values row
```

The GEE arraySlice function takes the dimension you want to subset and the start and end points along the dimension to extract 

Here we sliced out the year and fitted rows as lists. 

LandTrendr array slicing

### RMSE

The 'rmse' band is a scalar value that is the root mean square error between the original values and the segmentation-fitted values

It can be subset like this:

```javascript
var LTresult = ee.Algorithms.Test.LandTrendr(run_params); // run LT-GEE
var segmentationInfo = LTresult.select(['rmse']); // subset the rmse band
```

### FTV

The FTV or fit to vertice data bands are included as outputs




## <a id='examples'></a>Example Scripts


Three use case examples are provided, each of them begins with the same process of parameter definition and collection building and then varies on what is done with the results from the LT-GEE call.


**1. Exploration and parameterization**

LandTrendr can be run in point mode to visualize the segmentation for a pixel. 
This is really useful for quickly testing the performance of various parameter 
settings and spectral indices, as well as simply viewing and interpreting change 
in the x-y space of time and spectral value for both the source and LandTrendr 
trajectory-fitted data.

![time series](https://github.com/eMapR/LT-GEE/blob/master/imgs/time_series.png)

[Example script](https://code.earthengine.google.com/3aef4bddbae77d3205b0408a84c83a4b)
<br><br><br><br>

**2. Data generation**

LandTrendr can be run in a data generation mode where every pixel time series 
within the bounds of a given region is segmented and a data cube containing 
the segmented line structure and trajectory-fitted time series stack is returned. 
The results are the basic building blocks for historical landscape state and change mapping.

![data stack](https://github.com/eMapR/LT-GEE/blob/master/imgs/stack.gif)

[Example script](https://code.earthengine.google.com/c11bcd88ed5b3cc4ff027c7ac295a16d)
<br><br><br><br>

<a id='changemap'></a>**3. Change mapping**

Change events can be extracted and mapped from LandTrendr's segmented line vertices. 
Information regarding the year of change event detection, magnitude of change, duration 
of change, and pre-change event spectral data can all be mapped.

![change map](https://github.com/eMapR/LT-GEE/blob/master/imgs/yod_mapped.png)

[Example script](https://code.earthengine.google.com/fead5b85912695c4d313a6e0a445fc91)
<br><br><br><br>

## <a id='documentation'></a>Function Documentation




### Argument definitions





ee.Algorithms.Test.LandTrendr()


## <a id='faq'></a>FAQ

>Q: I have read or heard that `for` loops and client-side conditionals like `if` statements are GEE no-nos, yet you include them in your example scripts. What's the deal?<br><br>A: *We don't mix server-side and client-side objects and operations, which, as we understand it, are the main issues. We are also not GEE wizards, so please, we are calling on everyone to help make better, more GEE-friendly template scripts to share.*

## <a id='references'></a>References

>[Gorelick, N., Hancher, M., Dixon, M., Ilyushchenko, S., Thau, D., & Moore, R. (2017). Google Earth Engine: Planetary-scale geospatial analysis for everyone. *Remote Sensing of Environment, 202*, 18-27.](https://github.com/eMapR/LT-GEE/blob/master/docs/gorelick_etal_2017_google_earth_engine.pdf)

>[Kennedy, R. E., Yang, Z., & Cohen, W. B. (2010). Detecting trends in forest disturbance and recovery using yearly Landsat time series: 1. LandTrendr—Temporal segmentation algorithms. *Remote Sensing of Environment, 114*(12), 2897-2910.](https://github.com/eMapR/LT-GEE/blob/master/docs/kennedy_etal_2010_landtrendr.pdf)

>[Kennedy, R. E., Yang, Z., Cohen, W. B., Pfaff, E., Braaten, J., & Nelson, P. (2012). Spatial and temporal patterns of forest disturbance and regrowth within the area of the Northwest Forest Plan. Remote Sensing of Environment, 122, 117-133.](https://github.com/eMapR/LT-GEE/blob/master/docs/kennedy_etal_2012_disturbance_nwfp.pdf)

>[Kennedy, R.E., Yang, Z., Gorelick, N., Braaten, J., Cavalcante, L., Cohen, W.B., Healey, S. (2018). Implementation of the LandTrendr Algorithm on Google Earth Engine. Remote Sensing. 10, 691.](https://github.com/eMapR/LT-GEE/blob/master/docs/kennedy_etal_2018_lt-gee.pdf)
