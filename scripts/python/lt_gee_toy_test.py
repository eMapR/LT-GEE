
# coding: utf-8

# In[1]:


import ee
import datetime
import time

ee.Initialize()


# In[2]:


# define collection and LandTrendr parameters
aoi = [[-123.98757934570312,47.49679221520181],
       [-123.90655517578125,47.49586436835716],
       [-123.90449523925781,47.55243302404593],
       [-123.98551940917969,47.553359870859]]

aoi = ee.Geometry.Polygon(aoi) 

startYear = 1985
endYear   = 2010

runParams = { 
    'maxSegments':            6,
    'spikeThreshold':         0.9,
    'vertexCountOvershoot':   3,
    'preventOneYearRecovery': True,
    'recoveryThreshold':      0.25,
    'pvalThreshold':          0.05,
    'bestModelProportion':    0.75,
    'minObservationsNeeded':  6
}


# In[3]:


# function to get spectral-temporal segment info formatted to image stack for export    
def getLTvertStack(LTresult):
    emptyArray = []  
    vertLabels = []
    for i in range(1, runParams['maxSegments']+2):
        vertLabels.append("vert_"+str(i))
        emptyArray.append(0)
        
    zeros = ee.Image(ee.Array([emptyArray,
                             emptyArray,
                             emptyArray]))
  
    lbls = [['yrs_','src_','fit_'], vertLabels,]

    vmask = LTresult.arraySlice(0,3,4)
  
    ltVertStack = LTresult.arrayMask(vmask)                          .arraySlice(0, 0, 3)                          .addBands(zeros)                          .toArray(1)                          .arraySlice(1, 0, runParams['maxSegments']+1)                          .arrayFlatten(lbls, '')

    return ltVertStack


# In[4]:


# build annual image collection and run LandTrendr
for year in range(startYear,endYear+1):  
    img = ee.ImageCollection('LANDSAT/LT05/C01/T1_SR')          .filterBounds(aoi)          .filterDate(str(year)+'-06-15', str(year)+'-09-15')
  
    img = ee.Image(img.first())

    tempCollection = ee.ImageCollection(img.select(['B5']))        

    if year == startYear:
        ltCollection = tempCollection
    else:
        ltCollection = ltCollection.merge(tempCollection)

        
# add the collection to the LandTrendr parameters and run LT-GEE
runParams['timeSeries'] = ltCollection
lt = ee.Algorithms.TemporalSegmentation.LandTrendr(**runParams)


# In[5]:


# extract the segmentation vertex info and export it to google drive
ltVertStack = getLTvertStack(lt.select(["LandTrendr"])).toShort()

drive = ee.batch.Export.image.toDrive(
            image = ltVertStack,
            description = "ltVertStack_toy_test_to_drive", 
            folder = 'lt_gee_py_test', 
            fileNamePrefix = 'ltVertStack_toy_test',
            region = [[-123.98757934570312,47.49679221520181],[-123.90655517578125,47.49586436835716],[-123.90449523925781,47.55243302404593],[-123.98551940917969,47.553359870859]], 
            scale = 30
        )
drive.start()

