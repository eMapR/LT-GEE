#![banner image](https://github.com/eMapR/LT-GEE/blob/master/docs/lt_gee_symbols_small.png)

# **LT-GEE**

**LandTrendr (Landsat-based detection of trends in disturbance and recovery) implementation in the Google Earth Engine platform**

## Introduction

LandTrendr is set of spectral-temporal segmentation algorithms that are useful for change detection in moderate resolution satellite imagery (primarily Landsat) and for generating trajectory-based spectral time series data largely absent of inter-annual signal noise. LandTrendr was originally implemented in IDL (Interactive Data Language), but with the help of engineers at Google, it has been ported to the Google Earth Engine (GEE) platform ([overview](https://earthengine.google.com/), [paper](https://github.com/eMapR/LT-GEE/blob/master/docs/gorelick_etal_2017_google_earth_engine.pdf)). The GEE framework nearly eliminates the onerous data management and image-preprocessing aspects of the IDL implementation. It is also light-years faster than the IDL implementation, where computing time is measured in minutes instead of days.

This guide is intended to introduce the basics of running LandTrendr in GEE. It walks though parameters definitions, building an image collection, and formatting the outputs for three use cases. It is assumed that you have a [GEE account](https://signup.earthengine.google.com/#!/), that you are somewhat familiar with the [GEE JavaScript API](https://developers.google.com/earth-engine/), and have a basic understanding of LandTrendr ([method](https://github.com/eMapR/LT-GEE/blob/master/docs/kennedy_etal_2010_landtrendr.pdf), [application](https://github.com/eMapR/LT-GEE/blob/master/docs/kennedy_etal_2012_disturbance_nwfp.pdf)).

The three use case examples described include:

1. Exploration and parameterization

LandTrendr can be run in a spatial reduction mode (point of polygon) to visualize a summary of the segmentation for the pixel(s) defined in a given geometry. This is really useful for quickly testing the performance of various parameter settings and spectral indices, as well as simply viewing and interpreting change in the x-y space of time and spectral value for both the source and LandTrendr trajectory-fitted data.

![time series](https://github.com/eMapR/LT-GEE/blob/master/docs/time_series.png)

2. Data generation

LandTrendr can be run in a data generation mode where every pixel time series within the bounds of a given region is segmented and a data cube containing the segmented line structure and trajectory-fitted time series stack is returned. The results are the basic building blocks for historical landscape state and change mapping.

![data stack](https://github.com/eMapR/LT-GEE/blob/master/docs/stack.gif)

3. Change mapping

Change events can be extracted and mapped from LandTrendr's segmented line vertices. Information regarding the year of change event detection, magnitude of change, duration of change, and pre-change event spectral data can all be mapped.

Each of these use cases begins with the same process of parameter definition and collection building.









>[Kennedy, R. E., Yang, Z., & Cohen, W. B. (2010). Detecting trends in forest disturbance and recovery using yearly Landsat time series: 1. LandTrendr—Temporal segmentation algorithms. *Remote Sensing of Environment, 114*(12), 2897-2910.]()

>[Gorelick, N., Hancher, M., Dixon, M., Ilyushchenko, S., Thau, D., & Moore, R. (2017). Google Earth Engine: Planetary-scale geospatial analysis for everyone. *Remote Sensing of Environment, 202*, 18-27.]()