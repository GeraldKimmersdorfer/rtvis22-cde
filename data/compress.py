# This script takes the GlobalLandTemperaturesByCity.csv file from the dataset
# https://www.kaggle.com/datasets/berkeleyearth/climate-change-earth-surface-temperature-data and creates
# a binary compressed version for the Climatic Change Viewer it furthermore interpolates NULL and error values and
# precalculates the coordinates in equirectangular view.

filesource = "data/source/GlobalLandTemperaturesByCity.csv"
#filesource = "data/source/GlobalLandTemperaturesByCity100k.csv"

filedest = "dist/cdata.xz"
progressrefreshevery = 1000

from csv import DictReader
from tqdm import tqdm
import struct
import datetime
import lzma

def getposcode(latstr, longstr):
    return latstr + longstr

#####################################################################
################## READ FILE AND EXTRACT OBJECTS ####################
#####################################################################
counttemp = 0
positionmap = {}
positionlist = []
countrymap = {}
countrylist = []
temperaturelist = []
mindate = datetime.datetime.now()
maxdate = datetime.datetime.strptime("0001-01-01", "%Y-%m-%d")
with open(filesource, 'r', encoding="utf-8") as read_obj:
    csv_reader = DictReader(read_obj)
    progressbar = tqdm(unit=" lines", unit_scale=True, desc="Reading Input File")
    for row in csv_reader:
        counttemp += 1
        row['dt'] = datetime.datetime.strptime(row['dt'], "%Y-%m-%d")
        mindate = min(row['dt'], mindate)
        maxdate = max(row['dt'], maxdate)

        
        row['src'] = 0
        try:
            row['avgt'] = float(row['AverageTemperature'])
        except:
            row['avgt'] = 0.0
            row['src'] = 1

        row['poscode'] = getposcode(row['Latitude'], row['Longitude'])
        if not row['poscode'] in positionmap:
            #if not row['Country'] in countrymap:
                # add new country entry
                #countrymap[row['Country']] = len(countrylist)
                #countrylist.append(row['Country'])
            # add new positionslist entry
            positionlist.append({
                'lat': row['Latitude'],
                'long': row['Longitude'],
                'city': row['City']
            })
            positionmap[row['poscode']] = len(positionlist) - 1

        temperaturelist.append({
            "avgt": row['avgt'],
            "pid": positionmap[row['poscode']],
            "src": row['src'],
            "dt": row['dt']
        })

        if not counttemp % progressrefreshevery:
            # Give the user some form of feedback every x entries:
            progressbar.update(progressrefreshevery)
    progressbar.close()

##################################################################
################## CALCULATE PROJECTED POINTS ####################
##################################################################
for val in positionlist:
    #ToDo calculate x,y equirectangular projection
    val['x'] = 0.0 
    val['y'] = 0.0

#ToDo: Interpolate all temp where src = 1



#print(f"{counttemp} entries. {mindate} min. {maxdate} max. {len(countrylist)} countries, {len(positionmap)} positions", flush=True)

#########################################################
################## GET BINARY DATA ######################
#########################################################

bdata = bytearray()

bdata.extend(mindate.year.to_bytes(2, "big", signed=False))          # 2 byte
bdata.extend(mindate.month.to_bytes(1, "big", signed=False))         # 1 byte
bdata.extend(mindate.day.to_bytes(1, "big", signed=False))           # 1 byte
bdata.extend(maxdate.year.to_bytes(2, "big", signed=False))          # 2 byte
bdata.extend(maxdate.month.to_bytes(1, "big", signed=False))         # 1 byte
bdata.extend(maxdate.day.to_bytes(1, "big", signed=False))           # 1 byte

bdata.extend(counttemp.to_bytes(4, "big", signed=False))             # 4 byte
bdata.extend((len(positionmap)).to_bytes(2, "big", signed=False))    # 2 byte
bdata.extend((len(countrylist)).to_bytes(1, "big", signed=False))    # 1 byte

# now lets write the position lut (index is derived
# by position in file (we don't need to save that)
for val in positionlist:                                                 # len(positionmap) *
    bdata.extend(struct.pack(">f", val['x']))               # 4 byte
    bdata.extend(struct.pack(">f", val['y']))               # 4 byte

progressbar = tqdm(total=counttemp, unit=" lines", unit_scale=True, desc="Writing temperature data")
for i, itm in enumerate(temperaturelist):
    ddates = (itm['dt'] - mindate).days
    bdata.extend(ddates.to_bytes(4, "big", signed=False))            # 4 byte
    bdata.extend(itm['pid'].to_bytes(2, "big", signed=False))             # 2 byte
    bdata.extend(struct.pack(">f", itm['avgt']))                            # 4 byte
    bdata.extend(itm['src'].to_bytes(1, "big", signed=False))               # 1 byte

    if not i % progressrefreshevery:
        progressbar.update(progressrefreshevery)
progressbar.close()

##############################################################################
################## COMPRESS BINARY DATA AND WRITE TO FILE ####################
##############################################################################
print("compress file...")
my_filters = [
    {
        "id": lzma.FILTER_LZMA2,
        "preset": 9 | lzma.PRESET_EXTREME,
        "dict_size": 128 * 1000000
    },
]
with lzma.open(filedest, "w", filters=my_filters, format=lzma.FORMAT_XZ) as file:
    file.write(bdata)