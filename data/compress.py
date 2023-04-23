
import pandas as pd
import os
import numpy as np
import util as ut
import math
import struct


# === INPUT LAYOUT ===
# The pandas frame has to contain at least the following columns:
#  - Latitude, Longitude: Latitude und Longitude in degree floats format
#  - AverageTemperature: The average temperature of this record
#  - Year, Month: Capturing time of temperature
# Additionally the following can be provided
#  - AverageTemperatureUncertainty: The uncertainty for this record.
#  - Interpolated: A boolean value indicating wether this value is actually calculated

##### === OUTPUT BINARY FILE LAYOUT (VERSION 3) ===
##### Some indices-representations are dependend on the amount of entries in
##### respective table. (e.g. if just 200 temperatures => We can use 1 byte for index)
##### The byte length for the index can be calculated by the following function:
##### getByteCountForIndex(size) => lambda size: math.ceil(math.log2(size) / 8.0)
##### getByteCountForMonthDifference(datebounds) => lambda db:  getByteCountForIndex((db["db_last_month"] - db["db_first_month"] + 1 + (db["db_last_year"] - db["db_first_year"]) * 12) + 1)
#
### FILE IDENTIFICATION [4 byte]
# 3 byte, str(ASCII), fileidentification = 'CCE' = x434345 = 4408133
# 1 byte, u8, fileversion = 3
#
### HEADER [30 byte]
# 4 byte, u32, count_temperatures, (max. ~2.1 billion)
# 4 byte, u32, count_locations
# 4 byte, u32, count_ctilb, Continuous-Temperature-Index-Lookup-Blocks
# 6 byte, datebounds
#   - u16, db_first_year, first year in dataset (e.g. 1970)
#   - u8,  db_first_month, first month in dataset (e.g. 0 = january)
#   - u16, db_last_year, last last year in dataset (e.g. 2020) (inklusive!)
#   - u8,  db_last_month, last month in dataset (e.g. 0 = january) (inklusive!)
# 8 byte, temperaturebounds, upper and lower bounds for discretization
#   - f32, db_min_temp, minimum temperature value in database
#   - f32, db_max_temp, maximum temperature value in database
# 1 byte, u8,  bc_temperature [A], Discretize-Resolution
# 1 byte, u8,  bc_temperatureindex [B], getByteCountForIndex(count_locations)
# 1 byte, u8,  bc_monthdifference [C], getByteCountForMonthDifference(datebounds)
# 1 byte, u8,  bc_ctilbindex [D], getByteCountForIndex(count_tilb)
#
### TEMPERATURES [(A*count_temperatures) byte]
# A byte, u8|u16|u24|u32, Discretized temperature value
# 
### CTILBS [(C+2B)*count_ctilb]
# C byte, u8|u16|u24|u32, first_month, The first month of this chunk (in month difference to datebounds.first)
# B byte, u8|u16|u24|u32, id_temp_min, First index in temperature-list belonging to this ctilb
# B byte, u8|u16|u24|u32, id_temp_max, Last index in temperature-list belonging to this ctilb 
#
### LOCATIONS [(8+2*D)*count_locations) byte]
# 8 byte, position
#   - f32, latitude
#   - f32, longitude
# D byte, u8|u16|u24|u32, id_ctilb_min, First index in ctilb-list belonging to this location (inklusive)
# D byte, u8|u16|u24|u32, id_ctilb_max, Last index in ctilb-list belonging to this location (inklusive)
# 
def compress_dataset(
        df_data,       # The pandas frame containing the data
        output_path,        # Directory on where to save the output data
        filename = "auto",   # Filename for the compressed data-file. Auto for generated name
        discretizeresolution = 2,   # byte-count for discretized temperature values. (1-4)
        compressionpreset = 0       # preset for lzma compressor
):
    if not isinstance(df_data, pd.DataFrame):
        raise Exception("df_data has to be a dataframe")
    if not {'Latitude', 'Longitude', 'AverageTemperature', 'Year', 'Month'}.issubset(df_data.columns):
        raise Exception("A necessary column is missing inside the dataframe")
    if not os.path.exists(output_path):
        raise Exception(f"Directory  '{output_path}' does not exist")
    if not ( discretizeresolution == 1 or discretizeresolution == 2 or discretizeresolution == 4 ):
        raise Exception(f"Only Discretize-Resolutions allowed are 1,2 or 4 byte")

    ### STEP 1: Delete all NaN values
    print("Dropping NaNs...", end="")
    df = df_data.dropna().reset_index(drop=True)
    print(f" -> removed {len(df_data) - len(df)} rows")

    ### STEP 2: Convert data to correct representation
    print("Converting data types...")
    if not 'AverageTemperatureUncertainty' in df_data.columns: 
        df['AverageTemperatureUncertainty'] = np.nan
    if not 'Interpolated' in df_data.columns:
        df['Interpolated'] = False
    df = df.astype({
        'Latitude': np.float32, 
        'Longitude': np.float32,
        'Year': np.uint32,
        'Month': np.uint32,
        'AverageTemperature': np.float32,
        'AverageTemperatureUncertainty': np.float32,
        'Interpolated': bool
    })

    ### STEP 3: Create ID column for Location
    print("Creating location ID...", end="")
    df['locid'] = df.groupby(["Latitude", "Longitude"]).ngroup().astype(np.uint32)
    print(f" -> Found {df['locid'].max() + 1} distinct locations")

    ### STEP 4: Average Rows with same Year, Month and locid
    print("Merging rows with same year, month and locid...", end="")
    df_tmp = df.groupby(['locid', 'Year', 'Month']) \
        .agg(AverageTemperature=('AverageTemperature', 'mean'),AverageTemperatureUncertainty=('AverageTemperatureUncertainty', 'mean'), Latitude=('Latitude', 'first'), Longitude=('Longitude', 'first'), Interpolated=('Interpolated', 'any') ) \
       .reset_index()
    print(f" -> merged {len(df) - len(df_tmp)} rows")
    df = df_tmp

    ### STEP 5: Create CTILB IDs
    print("Creating CTILB ID...", end="")
    df.sort_values(by=["locid","Year","Month"], inplace=True)
    df['ctilbid'] = ((df['Year'] - df['Year'].shift(1)) * 12 + (df['Month'] - df['Month'].shift(1)) + (df['locid'] - df['locid'].shift(1)) * 100000) - 1
    df.loc[df['ctilbid'] != 0.0, "ctilbid"] = 1.0
    df.loc[df['ctilbid'] == 0.0, "ctilbid"] = np.nan
    df_part = df.loc[df['ctilbid'] > 0.0, "ctilbid"] 
    df.loc[df['ctilbid'] > 0.0, "ctilbid"] = pd.Series(np.arange(df_part.size), df_part.index) 
    df['ctilbid'] = df['ctilbid'].fillna(method="ffill").astype(np.uint32)
    print(f" -> Found {df['ctilbid'].max() + 1} distinct continous temperature index blocks")

    ### STEP 6: Get Header-Data and create dm column
    #df['date'] = pd.to_datetime(dict(year=df.Year, month=df.Month, day=1)) Create Date-Column (kinda slow)
    print("Get Header-Data...")
    count_temperatures = len(df)
    count_locations = df['locid'].max().item() + 1
    count_ctilb = df['ctilbid'].max().item() + 1
    datebounds = {
        "db_first_year": df['Year'].min().item(),
        "db_last_year": df['Year'].max().item()
    }
    datebounds['db_first_month'] = df.loc[df['Year']==datebounds["db_first_year"], 'Month'].min().item()
    datebounds['db_last_month'] =  df.loc[df['Year']==datebounds["db_last_year"],'Month'].max().item()
    temperaturebounds = {
        "db_min_temp": df['AverageTemperature'].min().item(),
        "db_max_temp": df['AverageTemperature'].max().item()
    }
    print("Create DM-Column...")
    df['dm'] = (df['Year'] - datebounds['db_first_year']) * 12 + df['Month'] - datebounds['db_first_month']
    getByteCountForIndex = lambda size: math.ceil(math.log2(size) / 8.0)
    getByteCountForMonthDifference = lambda db:  getByteCountForIndex((db["db_last_month"] - db["db_first_month"] + (db["db_last_year"] - db["db_first_year"]) * 12) + 1)
    bc_temperature = discretizeresolution
    bc_temperatureindex = getByteCountForIndex(count_temperatures)
    bc_monthdifference = getByteCountForMonthDifference(datebounds)
    bc_ctilbindex = getByteCountForIndex(count_ctilb)
    print("== HEADER ==")
    print(f" -> Counts: Temperatures={count_temperatures}; Locations={count_locations}; CTILBs={count_ctilb}")
    print(" -> Datebounds: ", datebounds)
    print(" -> Temperaturebounds: ", temperaturebounds)
    print(f" -> Byte-Counts: bc_temperature={bc_temperature}, bc_temperatureindex={bc_temperatureindex}, bc_monthdifference={bc_monthdifference}, bc_ctilbindex={bc_ctilbindex}")

    ### STEP 7: Discretize Temperature using Min/Max Normalization
    print("Discretize Temperature...")
    max_temperature_dis = 2**(bc_temperature*8)-1
    df['disTemp'] = (((df['AverageTemperature'] - temperaturebounds['db_min_temp'])/(temperaturebounds['db_max_temp']-temperaturebounds['db_min_temp'])) * max_temperature_dis).astype(np.uint32)
    print("Calculating discretization error...")
    df['disError'] = (df['AverageTemperature'] - ((df['disTemp'].astype(np.float32) / max_temperature_dis) * (temperaturebounds['db_max_temp']-temperaturebounds['db_min_temp']) + temperaturebounds['db_min_temp'])).abs()
    df.loc[np.isnan(df['AverageTemperatureUncertainty']), "AverageTemperatureUncertainty"] = 0.0
    df['disErrorUnc'] = df['disError'] - df['AverageTemperatureUncertainty']
    df.loc[df['disErrorUnc'] < 0.0, 'disErrorUnc'] = 0.0
    stats = df[['disError', 'disErrorUnc']].rename(columns={'disError': 'Discretization error', 'disErrorUnc': 'Discretization error with Uncertainty'}).describe()
    print(stats)

    ### STEP 8: Get Binary data
    bdata = bytearray()

    # FILE IDENTIFICATION [4 byte]
    fileversion = 3
    bdata.extend(bytes("CCE", "ascii"))
    bdata.extend(fileversion.to_bytes(1, "big", signed=False))

    # HEADER [30 byte]
    bdata.extend(count_temperatures.to_bytes(4, "big", signed=False))
    bdata.extend(count_locations.to_bytes(4, "big", signed=False))
    bdata.extend(count_ctilb.to_bytes(4, "big", signed=False))
    bdata.extend(datebounds['db_first_year'].to_bytes(2, "big", signed=False))
    bdata.extend(datebounds['db_first_month'].to_bytes(1, "big", signed=False))
    bdata.extend(datebounds['db_last_year'].to_bytes(2, "big", signed=False))
    bdata.extend(datebounds['db_last_month'].to_bytes(1, "big", signed=False))
    bdata.extend(struct.pack(">f", temperaturebounds['db_min_temp']))
    bdata.extend(struct.pack(">f", temperaturebounds['db_max_temp']))
    bdata.extend(bc_temperature.to_bytes(1, "big", signed=False))
    bdata.extend(bc_temperatureindex.to_bytes(1, "big", signed=False))
    bdata.extend(bc_monthdifference.to_bytes(1, "big", signed=False))
    bdata.extend(bc_ctilbindex.to_bytes(1, "big", signed=False))

    # TEMPERATURES [(A*count_temperatures) byte]
    bdata.extend(df['disTemp'].to_numpy(dtype=f'>u{bc_temperature}').tobytes())
    
    # CTILBS [(C+2B)*count_ctilb]
# C byte, u8|u16|u24|u32, first_month, The first month of this chunk (in month difference to datebounds.first)
# B byte, u8|u16|u24|u32, id_temp_min, First index in temperature-list belonging to this ctilb
# B byte, u8|u16|u24|u32, id_temp_max, Last index in temperature-list belonging to this ctilb 

    #bdata.extend()
    # TEMPERATURES [(A*count_temperatures) byte]
    #for index, row in df['disTemp'].iterrows():
    #    bdata.extend(row['disTemp'].to_bytes)


    ut.df_print_rows(df.loc[df['disTemp'] == df['disTemp'].min()], 400)
    

    return df
