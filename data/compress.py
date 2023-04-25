
import pandas as pd
import os
import numpy as np
import util as ut
import math
import struct
import lzma
import threading
from tqdm import tqdm
import time

FILEVERSION = 4

compression_methods = {
    'none': 0,
    'lzma': 1
}

bd_buffer_compressed = None

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
# 1 byte, u8, fileversion = FILEVERSION
#
### HEADER [28 byte]
# 4 byte, u32, count_temperatures, (max. ~2.1 billion)
# 4 byte, u32, count_locations
# 4 byte, u32, count_ctilb, Continuous-Temperature-Index-Lookup-Blocks
# 6 byte, datebounds
#   - u16, db_first_year, first year in dataset (e.g. 1970)
#   - u8,  db_first_month, first month in dataset (e.g. 1 = january)
#   - u16, db_last_year, last last year in dataset (e.g. 2020) (inklusive!)
#   - u8,  db_last_month, last month in dataset (e.g. 1 = january) (inklusive!)
# 8 byte, temperaturebounds, upper and lower bounds for discretization
#   - f32, db_min_temp, minimum temperature value in database
#   - f32, db_max_temp, maximum temperature value in database
# 1 byte, u8, bc_temperature [A], Discretize-Resolution
# 1 byte, u8, file_compression, How are the TEMPERATURES, CTILBS, LOCATIONS compressed? [0=No compression, 1=LZMA]
#
### TEMPERATURES [(A*count_temperatures) byte]
# A byte, u8|u16|u32, Discretized temperature value
# 
### CTILBS [8*count_ctilb]
# 4 byte, u32, first_month, The first month of this chunk (in month difference to datebounds.first)
# 4 byte, u32, id_temp_min, First index in temperature-list belonging to this ctilb
#
### LOCATIONS [(8+D)*count_locations) byte]
# 8 byte, position
#   - f32, latitude
#   - f32, longitude
# 4 byte, u32, id_ctilb_min, First index in ctilb-list belonging to this location (inklusive)
# 
def compress_dataset(
        df_data,       # The pandas frame containing the data
        output_path,        # Directory on where to save the output data
        filename = "auto",   # Filename for the compressed data-file. Auto for generated name
        discretizeresolution = 2,   # byte-count for discretized temperature values. (1-4)
        compression = "none",   # compression? (possible values: ""=="none", "lzma")
        lzma_preset = 0       # preset for lzma compressor
):
    if not isinstance(df_data, pd.DataFrame):
        raise Exception("df_data has to be a dataframe")
    if not {'Latitude', 'Longitude', 'AverageTemperature', 'Year', 'Month'}.issubset(df_data.columns):
        raise Exception("A necessary column is missing inside the dataframe")
    if not os.path.exists(output_path):
        raise Exception(f"Directory  '{output_path}' does not exist")
    if not ( discretizeresolution == 1 or discretizeresolution == 2 or discretizeresolution == 4 ):
        raise Exception(f"Only Discretize-Resolutions allowed are 1,2 or 4 byte")
    if compression == "":
        compression = "none"
    if not compression in compression_methods:
        raise Exception(f"Unsupported compression type ({compression})")

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

    ### STEP 5b: Create ID-Column
    df['id'] = df.index

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
    print("== HEADER ==")
    print(f" -> Counts: Temperatures={count_temperatures}; Locations={count_locations}; CTILBs={count_ctilb}")
    print(" -> Datebounds: ", datebounds)
    print(" -> Temperaturebounds: ", temperaturebounds)
    print(f" -> Byte-Counts: bc_temperature={bc_temperature}")

    ### STEP 7: Discretize Temperature using Min/Max Normalization
    print("Discretize Temperature...")
    max_temperature_dis = 2**(bc_temperature*8)-1
    df['disTemp'] = (((df['AverageTemperature'] - temperaturebounds['db_min_temp'])/(temperaturebounds['db_max_temp']-temperaturebounds['db_min_temp'])) * max_temperature_dis).astype(np.uint32)
    df['disError'] = (df['AverageTemperature'] - ((df['disTemp'].astype(np.float32) / max_temperature_dis) * (temperaturebounds['db_max_temp']-temperaturebounds['db_min_temp']) + temperaturebounds['db_min_temp'])).abs()
    df.loc[np.isnan(df['AverageTemperatureUncertainty']), "AverageTemperatureUncertainty"] = 0.0
    df['disErrorUnc'] = df['disError'] - df['AverageTemperatureUncertainty']
    df.loc[df['disErrorUnc'] < 0.0, 'disErrorUnc'] = 0.0
    stats = df[['disError', 'disErrorUnc']].rename(columns={'disError': 'Discretization error', 'disErrorUnc': 'Discretization error with Uncertainty'}).describe()
    print(stats)

    ### STEP 8: Get Binary data
    bd_header = bytearray()

    # FILE IDENTIFICATION [4 byte]
    bd_header.extend(bytes("CCE", "ascii"))
    bd_header.extend(FILEVERSION.to_bytes(1, "big", signed=False))

    # HEADER [30 byte]
    bd_header.extend(count_temperatures.to_bytes(4, "big", signed=False))
    bd_header.extend(count_locations.to_bytes(4, "big", signed=False))
    bd_header.extend(count_ctilb.to_bytes(4, "big", signed=False))
    bd_header.extend(datebounds['db_first_year'].to_bytes(2, "big", signed=False))
    bd_header.extend(datebounds['db_first_month'].to_bytes(1, "big", signed=False))
    bd_header.extend(datebounds['db_last_year'].to_bytes(2, "big", signed=False))
    bd_header.extend(datebounds['db_last_month'].to_bytes(1, "big", signed=False))
    bd_header.extend(struct.pack(">f", temperaturebounds['db_min_temp']))
    bd_header.extend(struct.pack(">f", temperaturebounds['db_max_temp']))
    bd_header.extend(bc_temperature.to_bytes(1, "big", signed=False))
    bd_header.extend(compression_methods[compression].to_bytes(1, "big", signed=False))

    bd_buffer = bytearray()

    # TEMPERATURES [(A*count_temperatures) byte]
    oldByteLength = len(bd_buffer)
    bd_buffer.extend(df['disTemp'].to_numpy(dtype=f'>u{bc_temperature}').tobytes())
    print(f"== TEMPERATURES ==\n -> Wrote {len(bd_buffer) - oldByteLength} Bytes of data")

    # CTILBS [(8)*count_ctilb]
    oldByteLength = len(bd_buffer)
    df_ctilb = df.groupby(['ctilbid']).agg(first_month=('dm', 'first'), id_temp_min=('id', 'first'))
    for row in tqdm(df_ctilb.itertuples(index=False, name=None), desc="Writing CTILB-Table"):
        bd_buffer.extend(row[0].to_bytes(4, "big", signed=False))
        bd_buffer.extend(row[1].to_bytes(4, "big", signed=False))
    print(f"== CTILBS ==\n -> Wrote {len(bd_buffer) - oldByteLength} Bytes of data")
    
    # LOCATIONS [(12)*count_locations) byte]
    oldByteLength = len(bd_buffer)
    df_locations = df.groupby(['locid']).agg(latitude=('Latitude', 'first'), longitude=('Longitude', 'first'), id_ctilb_min=('ctilbid', 'first'))
    for row in tqdm(df_locations.itertuples(index=False, name=None), desc="Writing Position-Table"):
        bd_buffer.extend(struct.pack(">f", row[0]))
        bd_buffer.extend(struct.pack(">f", row[1]))
        bd_buffer.extend(row[2].to_bytes(4, "big", signed=False))
    print(f"== LOCATIONS ==\n -> Wrote {len(bd_buffer) - oldByteLength} Bytes of data")

    ### STEP 9: Check file size for plausibility
    def calculateTheoreticalFileSize(count_temperatures, count_locations, count_ctilb, A):
        return 32 + A*count_temperatures + (8)*count_ctilb + (12)*count_locations
    expectedSize = calculateTheoreticalFileSize(count_temperatures,count_locations,count_ctilb,bc_temperature)
    if ((len(bd_buffer) + len(bd_header)) != expectedSize):
        raise Exception(f"Binary Data Size is incosistent. Expected: {expectedSize} Bytes, Actual: {len(bd_buffer) + len(bd_header)}")

    ### STEP 10: Compress binary data using LZMA (if required):
    def compress_file_async_lzma(data, preset):
        global bd_buffer_compressed
        # NOTE: LZMA2 and XZ not supported by JS Implementation. Also different dict_size than standard (64MByte) not supported.
        # NOTE: The new version actually might support it
        my_filters = [{"id": lzma.FILTER_LZMA1, "preset": preset }]
        bd_buffer_compressed = lzma.compress(data, format=lzma.FORMAT_ALONE, filters=my_filters)

    if compression == "lzma":
        thread = threading.Thread(target=compress_file_async_lzma, args=[bd_buffer, lzma_preset])
        thread.start()
        progressbar = tqdm(unit=" seconds", unit_scale=True, desc="Compressing binary data...", bar_format=r'{desc} [{elapsed}]')
        while thread.is_alive():
            progressbar.update(0.03)
            time.sleep(0.03)
        progressbar.close()

    ### STEP 11: Output file
    filepath = f"{output_path}/{filename}"
    if filename == "auto":
        filepath = f"{output_path}/t{ut.formatUIntNumber(count_temperatures)}_c{ut.formatUIntNumber(count_ctilb)}_l{ut.formatUIntNumber(count_locations)}_{discretizeresolution}b_{compression}.cce"
    
    with open(filepath, "wb") as file:
        file.write(bd_header)
        if compression == "none":
            file.write(bd_buffer)
        else:
            file.write(bd_buffer_compressed)

    #ut.df_print_rows(df.loc[df['disTemp'] == df['disTemp'].min()], 400)
    return df
