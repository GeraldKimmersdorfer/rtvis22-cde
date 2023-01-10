# This script takes the GlobalLandTemperaturesByCity.csv file from the dataset
# https://www.kaggle.com/datasets/berkeleyearth/climate-change-earth-surface-temperature-data and creates
# a binary compressed version for the Climatic Change Viewer

filesource = "data/source/GlobalLandTemperaturesByCity_interpolated.csv"
#filesource = "data/source/GlobalLandTemperaturesByCity_interpolated_small.csv"
discretizeresolution = 2 # bytes for discretized temperature values

rowdropchance = 0.9 # to gain a smaller filesize for debugging, should be 0 for full dataset

filedest = "src/assets/cdata.lzma"
progressrefreshevery = 1000

import csv
from tqdm import tqdm
from util import tolatlongfloat
import time
import struct
from datetime import datetime
import lzma
import threading
import random

def getposcode(latstr, longstr):
    return latstr + longstr

#####################################################################
################## READ FILE AND EXTRACT OBJECTS ####################
#####################################################################
counttemp_noninterpolated = 0
positionmap = {}
positionlist = []
countrymap = {}
countrylist = []
temperaturelist = []
boundsdate = [datetime.max, datetime.min]
boundsavgt = [float('inf'), -float('inf')]
with open(filesource, 'r', encoding="utf-8") as read_obj:
    # Read Header and check if correct
    header = read_obj.readline().strip()
    if header != "dt,AverageTemperature,AverageTemperatureUncertainty,City,Country,Latitude,Longitude,src":
        raise Exception("The header of the CSV-File doesn't seem to be correct!")
    csv_reader = csv.reader(read_obj) # Note: DictReader is slower!!
    progressbar = tqdm(unit=" lines", unit_scale=True, desc="Reading Input File")
    i = 0
    for row in csv_reader:
        if random.random() < rowdropchance:
            continue
        i += 1
        titem = {}
        titem['dt'] = datetime.strptime(row[0], "%Y-%m-%d")
        boundsdate = [min(titem['dt'], boundsdate[0]), max(titem['dt'], boundsdate[1])]

        titem['src'] = int(row[7])
        try:
            titem['avgt'] = float(row[1])
            counttemp_noninterpolated += 1
        except:
            # we should not end up here anymore because we interpolated in a previous step
            titem['avgt'] = 0.0
            titem['src'] = 1
        boundsavgt = [min(titem['avgt'], boundsavgt[0]), max(titem['avgt'], boundsavgt[1])]
        try:
            titem['avgtu'] = abs(float(row[2]))
        except:
            titem['avgtu'] = 0.0
        poscode = getposcode(row[5], row[6])
        if not poscode in positionmap:
            #if not row['Country'] in countrymap:
                # add new country entry
                #countrymap[row['Country']] = len(countrylist)
                #countrylist.append(row['Country'])
            # add new positionslist entry
            positionlist.append({
                'lat': row[5],
                'lon': row[6],
                'city': row[3]
            })
            positionmap[poscode] = len(positionlist) - 1

        titem['pid'] = positionmap[poscode]
        temperaturelist.append(titem)

        if not i % progressrefreshevery:
            progressbar.update(progressrefreshevery)
    progressbar.close()

##################################################################
################## DISCRETIZATION OF AVGT ########################
##################################################################
avgtspan = boundsavgt[1] - boundsavgt[0]
maxdisnumber = (2 ** (discretizeresolution * 8)) - 1
maxerror = 0.0
avgerror = 0.0
maxerror_outofuncertainty = 0.0
avgerror_outofuncertainty = 0.0
progressbar = tqdm(total=len(temperaturelist), unit=" entries", unit_scale=True, desc="Discretize temperature data")
for i, itm in enumerate(temperaturelist):
    itm['avgtdis'] = int(round(((itm['avgt'] - boundsavgt[0]) / avgtspan) * maxdisnumber))
    # just do error evaluation on non-interpolated temperature values:
    if itm['src'] == 0:
        disvalue = ((itm['avgtdis'] / float(maxdisnumber)) * avgtspan) + boundsavgt[0]
        error = abs(itm['avgt'] - disvalue)
        if error < itm['avgtu']:
            error_outofuncertainty = 0.0
        else:
            error_outofuncertainty = error - itm['avgtu']
        avgerror_outofuncertainty += (error_outofuncertainty / counttemp_noninterpolated)
        maxerror_outofuncertainty = max(error_outofuncertainty, maxerror_outofuncertainty)
        avgerror += (error / counttemp_noninterpolated)
        maxerror = max(error, maxerror)
    if not i % progressrefreshevery:
        progressbar.update(progressrefreshevery)
progressbar.close()

print(f"Discretization introduced an error of max {maxerror}°C and on average: {avgerror}°C")
print(f"With uncertainty it results into an error of max {maxerror_outofuncertainty}°C and on average: {avgerror_outofuncertainty}°C")

##################################################################
################## CALCULATE PROJECTED POINTS ####################
##################################################################
# Note: Nope were gonna do that on the gpu to support various projections
for val in positionlist: 
    val['lat'], val['lon'] = tolatlongfloat(val['lat'], val['lon'])

##################################################################
################## REORGANIZE DATA ###############################
##################################################################
# We want to save the temp data without pid. So we have to sort templist by pid
# and then save start- and endindices inside poslist

progressbar = tqdm(total=len(temperaturelist), unit=" lines", unit_scale=True, desc="Calculating month-difference values")
for i, itm in enumerate(temperaturelist):
    delta_months = (itm['dt'].year - boundsdate[0].year) * 12 + (itm['dt'].month - boundsdate[0].month)
    itm['dm'] = delta_months
    if not i % progressrefreshevery:
        progressbar.update(progressrefreshevery)

progressbar.close()

print(f"Resorting temperature table...")
temperaturelist.sort(key = lambda x: x['dt'], reverse=False) # secondly by dm
temperaturelist.sort(key = lambda x: x['pid'], reverse=False) # and first by pid

positionlist[temperaturelist[0]['pid']]['id_min'] = 0
progressbar = tqdm(total=len(temperaturelist), unit=" lines", unit_scale=True, desc="Evaluating Position Indices")
for i in range(1, len(temperaturelist)):
    if (temperaturelist[i-1]['pid'] != temperaturelist[i]['pid']):
        positionlist[temperaturelist[i-1]['pid']]['id_max'] = i - 1
        positionlist[temperaturelist[i]['pid']]['id_min'] = i
    
    if not i % progressrefreshevery:
        progressbar.update(progressrefreshevery)

progressbar.update(progressrefreshevery)
progressbar.close()
positionlist[temperaturelist[len(temperaturelist) - 1]['pid']]['id_max'] = len(temperaturelist) - 1

#print(f"{counttemp} entries. {mindate} min. {maxdate} max. {len(countrylist)} countries, {len(positionmap)} positions", flush=True)

#########################################################
################## GET BINARY DATA ######################
#########################################################

bdata = bytearray()

bdata.extend(discretizeresolution.to_bytes(1, "big", signed=False))        # 1 byte

bdata.extend(boundsdate[0].year.to_bytes(2, "big", signed=False))          # 2 byte
bdata.extend(boundsdate[0].month.to_bytes(1, "big", signed=False))         # 1 byte
bdata.extend(boundsdate[0].day.to_bytes(1, "big", signed=False))           # 1 byte
bdata.extend(boundsdate[1].year.to_bytes(2, "big", signed=False))          # 2 byte
bdata.extend(boundsdate[1].month.to_bytes(1, "big", signed=False))         # 1 byte
bdata.extend(boundsdate[1].day.to_bytes(1, "big", signed=False))           # 1 byte

bdata.extend(struct.pack(">f", boundsavgt[0]))
bdata.extend(struct.pack(">f", boundsavgt[1]))

bdata.extend((len(temperaturelist)).to_bytes(4, "big", signed=False))      # 4 byte
bdata.extend((len(positionmap)).to_bytes(2, "big", signed=False))    # 2 byte
bdata.extend((len(countrylist)).to_bytes(1, "big", signed=False))    # 1 byte

# now lets write the position lut (index is derived
# by position in file (we don't need to save that)
for val in positionlist:                                                 # len(positionmap) *
    bdata.extend(struct.pack(">f", val['lat']))               # 4 byte
    bdata.extend(struct.pack(">f", val['lon']))               # 4 byte
    bdata.extend(val['id_min'].to_bytes(4, "big", signed=False))
    bdata.extend(val['id_max'].to_bytes(4, "big", signed=False))

progressbar = tqdm(total=len(temperaturelist), unit=" lines", unit_scale=True, desc="Writing temperature data")
for i, itm in enumerate(temperaturelist):
    packed_dm = (itm['dm'] << 2) | (itm['src'] & 3)                            # last two bits for src (just one needed but whatever)
    bdata.extend(packed_dm.to_bytes(2, "big", signed=False))            # 2 byte
    bdata.extend(itm['avgtdis'].to_bytes(discretizeresolution, "big", signed=False))

    if not i % progressrefreshevery:
        progressbar.update(progressrefreshevery)
progressbar.close()

##############################################################################
################## COMPRESS BINARY DATA AND WRITE TO FILE ####################
##############################################################################
def compress_file_async():
    my_filters = [
        {
            "id": lzma.FILTER_LZMA1,
            "preset": 9 | lzma.PRESET_EXTREME
        }#, NOTE: LZMA2 and XZ not supported by JS Implementation. Also different dict_size than standard (64MByte) not supported.
        #{
        #    "id": lzma.FILTER_LZMA2,
        #    "preset": 9 | lzma.PRESET_EXTREME,
        #    "dict_size": 128 * 1000000
        #},
    ]
    with lzma.open(filedest, "w", filters=my_filters, format=lzma.FORMAT_ALONE) as file:
        file.write(bdata)

thread = threading.Thread(target=compress_file_async)
thread.start()
progressbar = tqdm(unit=" seconds", unit_scale=True, desc="Compressing binary data...", bar_format=r'{desc} [{elapsed}]')
while thread.is_alive():
    progressbar.update(0.03)
    time.sleep(0.03)
progressbar.close()
