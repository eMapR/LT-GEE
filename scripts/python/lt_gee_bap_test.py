
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
endYear   = 2017
startDay  = '06-01'
endDay    = '09-30'


def segIndex(img):
    index = img.normalizedDifference(['B4', 'B7'])               .multiply(1000)               .select([0], ['NBR'])               .set('system:time_start', img.get('system:time_start'))
               
    return index.toShort()

global distDir
distDir = -1


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


# functions 
dummyCollection = ee.ImageCollection([ee.Image([0,0,0,0,0,0]).mask(ee.Image(0))])


## slope and intercept citation: Roy, D.P., Kovalskyy, V., Zhang, H.K., Vermote, E.F., Yan, L., Kumar, S.S, Egorov, A., 2016, Characterization of Landsat-7 to Landsat-8 reflective wavelength and normalized difference vegetation index continuity, Remote Sensing of Environment, 185, 57-70.(http:##dx.doi.org/10.1016/j.rse.2015.12.024) Table 2 - reduced major axis (RMA) regression coefficients
def harmonizationRoy(oli):
    slopes = ee.Image.constant([0.9785, 0.9542, 0.9825, 1.0073, 1.0171, 0.9949])
    itcp = ee.Image.constant([-0.0095, -0.0016, -0.0022, -0.0021, -0.0030, 0.0029])
    return oli.select(['B2','B3','B4','B5','B6','B7'],['B1', 'B2', 'B3', 'B4', 'B5', 'B7'])              .resample('bicubic')              .subtract(itcp.multiply(10000)).divide(slopes)              .set('system:time_start', oli.get('system:time_start'))              .toShort()


def getSRcollection(year, startDay, endDay, sensor, aoi):

    srCollection = ee.ImageCollection('LANDSAT/'+ sensor + '/C01/T1_SR')                     .filterBounds(aoi)                     .filterDate(str(year)+'-'+startDay, str(year)+'-'+endDay)
  
    def prepImages(img):
        dat = ee.Image(
            ee.Algorithms.If(
                sensor == 'LC08',
                harmonizationRoy(img.unmask()),
                img.select(['B1', 'B2', 'B3', 'B4', 'B5', 'B7'])\
                   .unmask()\
                   .resample('bicubic')\
                   .set('system:time_start', img.get('system:time_start'))
            )
        )

        qa = img.select('pixel_qa')
        mask = qa.bitwiseAnd(8).eq(0)                               .And(qa.bitwiseAnd(16).eq(0))                               .And(qa.bitwiseAnd(32).eq(0))

        return dat.mask(mask)


    return srCollection.map(prepImages)
  

def getCombinedSRcollection(year, startDay, endDay, aoi):
    lt5 = getSRcollection(year, startDay, endDay, 'LT05', aoi)
    le7 = getSRcollection(year, startDay, endDay, 'LE07', aoi)
    lc8 = getSRcollection(year, startDay, endDay, 'LC08', aoi)
    return ee.ImageCollection(lt5.merge(le7).merge(lc8))

  
def medoidMosaic(inCollection, dummyCollection):
    def calcDifFromMed(img):
        diff = ee.Image(img).subtract(median).pow(ee.Image.constant(2))
        return diff.reduce('sum').addBands(img)
    
    imageCount = inCollection.toList(1).length()
    finalCollection = ee.ImageCollection(ee.Algorithms.If(imageCount.gt(0), inCollection, dummyCollection))
    median = finalCollection.median()
    difFromMedian = finalCollection.map(calcDifFromMed)
    return ee.ImageCollection(difFromMedian).reduce(ee.Reducer.min(7)).select([1,2,3,4,5,6], ['B1','B2','B3','B4','B5','B7'])


def buildMosaic(year, startDay, endDay, aoi, dummyCollection):
    collection = getCombinedSRcollection(year, startDay, endDay, aoi)
    img = medoidMosaic(collection, dummyCollection)            .set('system:time_start', int(time.mktime(datetime.date(year,8,1).timetuple())))
    return ee.Image(img)


def buildMosaicCollection(startYear, endYear, startDay, endDay, aoi, dummyCollection):
    imgs = []
    for year in range(startYear,endYear+1):  
        tmp = buildMosaic(year, startDay, endDay, aoi, dummyCollection) 
        imgs.append(tmp.set('system:time_start', int(time.mktime(datetime.date(year,8,1).timetuple()))))

    return ee.ImageCollection(imgs)


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

  
def invertIndex(img):
    return img.multiply(distDir).toShort().set('system:time_start', img.get('system:time_start'))

def invertFTV(img):
    return img.addBands(img.select([0],[indexNameFTV])              .multiply(distDir))              .toShort()              .set('system:time_start', img.get('system:time_start'))


# In[4]:


# build annual image collection and run LandTrendr
annualSRcollection = buildMosaicCollection(startYear, endYear, startDay, endDay, aoi, dummyCollection)
annualIndexCollection = annualSRcollection.map(segIndex).map(invertIndex)
global indexNameFTV
indexNameFTV = ee.Image(annualIndexCollection.first()).bandNames().getInfo()[0]+'_FTV'
ltCollection = annualIndexCollection.map(invertFTV)


# add the collection to the LandTrendr parameters and run LT-GEE
runParams['timeSeries'] = ltCollection
lt = ee.Algorithms.TemporalSegmentation.LandTrendr(**runParams)


# In[5]:


# extract the segmentation vertex info and export it to google drive
ltVertStack = getLTvertStack(lt.select(["LandTrendr"])).toShort()

drive = ee.batch.Export.image.toDrive(
            image = ltVertStack,
            description = "ltVertStack_test_to_drive", 
            folder = 'lt_gee_py_test', 
            fileNamePrefix = 'ltVertStack_test',
            region = [[-123.98757934570312,47.49679221520181],[-123.90655517578125,47.49586436835716],[-123.90449523925781,47.55243302404593],[-123.98551940917969,47.553359870859]], 
            scale = 30
        )
drive.start()

