# This script takes the GlobalLandTemperaturesByCity.csv file from the dataset
# https://www.kaggle.com/datasets/berkeleyearth/climate-change-earth-surface-temperature-data and creates
# a binary compressed version for the Climatic Change Viewer it furthermore interpolates NULL and error values and
# precalculates the coordinates in equirectangular view.
from time import sleep

filesource = "source/GlobalLandTemperaturesByCity.csv"
#filesource = "source/GlobalLandTemperaturesByCity100k.csv"
filedest = "cdata.dat"

from csv import DictReader
from tqdm import tqdm
import struct
import datetime

def getposcode(latstr, longstr):
    return latstr + longstr

################## FIRST RUN ####################
#  - Evaluate min and max-date
#  - Position LUT, Country LUT
#  - Counts
#################################################
counttemp = 0
positionmap = {}
countrymap = {}
countrylist = []
mindate = datetime.datetime.now()
maxdate = datetime.datetime.strptime("0001-01-01", "%Y-%m-%d")
progressrefreshevery = 1000
with open(filesource, 'r', encoding="utf-8") as read_obj:
    csv_reader = DictReader(read_obj)
    progressbar = tqdm(unit=" lines", unit_scale=True, desc="First run")
    for row in csv_reader:
        counttemp += 1

        curdate = datetime.datetime.strptime(row['dt'], "%Y-%m-%d")
        if (curdate < mindate):
            mindate = curdate
        if (curdate > maxdate):
            maxdate = curdate

        poscode = getposcode(row['Latitude'], row['Longitude'])
        if not poscode in positionmap:
            if not row['Country'] in countrymap:
                # add new country entry
                countrymap[row['Country']] = len(countrylist)
                countrylist.append(row['Country'])
            # add new positionmap entry
            positionmap[poscode] = {
                'lat': row['Latitude'],
                'long': row['Longitude'],
                'city': row['City']
            }

        if not counttemp % progressrefreshevery:
            # Give the user some form of feedback every x entries:
            progressbar.update(progressrefreshevery)
    progressbar.close()

currposid = 0
for key in positionmap:
    positionmap[key]['id'] = currposid
    positionmap[key]['x'] = 0.0
    positionmap[key]['y'] = 0.0
    currposid += 1


# Now start to write the file:
print(f"{counttemp} entries. {mindate} min. {maxdate} max. {len(countrylist)} countries, {len(positionmap)} positions", flush=True)

dest_file = open(filedest, 'w+b')

dest_file.write(mindate.year.to_bytes(2, "big", signed=False))          # 2 byte
dest_file.write(mindate.month.to_bytes(1, "big", signed=False))         # 1 byte
dest_file.write(mindate.day.to_bytes(1, "big", signed=False))           # 1 byte
dest_file.write(maxdate.year.to_bytes(2, "big", signed=False))          # 2 byte
dest_file.write(maxdate.month.to_bytes(1, "big", signed=False))         # 1 byte
dest_file.write(maxdate.day.to_bytes(1, "big", signed=False))           # 1 byte

dest_file.write(counttemp.to_bytes(4, "big", signed=False))             # 4 byte
dest_file.write((len(positionmap)).to_bytes(2, "big", signed=False))    # 2 byte
dest_file.write((len(countrylist)).to_bytes(1, "big", signed=False))    # 1 byte

# now lets write the position lut (index is derived
# by position in file (we don't need to save that)
for key in positionmap:                                                 # len(positionmap) *
    dest_file.write(struct.pack(">f", positionmap[key]['x']))               # 4 byte
    dest_file.write(struct.pack(">f", positionmap[key]['y']))               # 4 byte



################## SECOND RUN ####################
#  - Write to binary file
##################################################
with open(filesource, 'r', encoding="utf-8") as read_obj:
    csv_reader = DictReader(read_obj)
    progressbar = tqdm(total=counttemp, unit=" lines", unit_scale=True, desc="Second run")
    i = -1
    for row in csv_reader:                                              # counttemp *
        i += 1
        curdate = datetime.datetime.strptime(row['dt'], "%Y-%m-%d")
        ddates = (curdate - mindate).days
        dest_file.write(ddates.to_bytes(4, "big", signed=False))            # 4 byte

        poscode = getposcode(row['Latitude'], row['Longitude'])
        posid = positionmap[poscode]['id']
        dest_file.write(posid.to_bytes(2, "big", signed=False))             # 2 byte

        try:
            avgt = float(row['AverageTemperature'])
        except:
            avgt = 0.0 #ToDo: Interpolate
        dest_file.write(struct.pack(">f", avgt))                            # 4 byte

        #ToDo: Source
        dest_file.write((0).to_bytes(1, "big", signed=False))               # 1 byte
        if not i % progressrefreshevery:
            # Give the user some form of feedback every x entries:
            progressbar.update(progressrefreshevery)
    progressbar.close()

dest_file.close()