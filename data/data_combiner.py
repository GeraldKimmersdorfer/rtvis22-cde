import pandas as pd
import os
import re
from tqdm import tqdm

LOCAL_FILE_PATH = "data/sources/berkley_local_summaries"
OUTPUT_FILE = "data/sources/combined.csv"


#name = 0.80N-8.84E
def getDataForOnePosition(name):
    count_file = f"{LOCAL_FILE_PATH}/{name}-TAVG-Counts.txt"
    trends_file = f"{LOCAL_FILE_PATH}/{name}-TAVG-Trend.txt"

    # Extract Data from comment at begin of trend file:
    chunk = ""
    with open(trends_file) as myFile:
        chunk = myFile.read(4069)

    #x = re.findall(r"for the location:[\s%]+([\d.\dNSEW ]+),([\d.\dNSEW ]+)", chunk); #for location
    country = re.findall(r"Country: ([\w\S ]+)", chunk) #for Country
    country = country[0] if len(country) > 0 else ""
    citys = re.findall(r"Nearby Cities: ([\w\S ]+)", chunk)
    citys = citys[0] if len(citys) > 0 else ""
    temperatureList = re.findall(r"Jan[\s]+Feb[\s]+Mar[\s]+Apr[\s]+May[\s]+Jun[\s]+Jul[\s]+Aug[\s]+Sep[\s]+Oct[\s]+Nov[\s]+Dec\s+%%([\w\s\S]+)%%", chunk)[0].strip().split(" ")
    temperatureList = list(filter(None, temperatureList))
    temperatureList = [eval(i) for i in temperatureList]

    latlon = name.split("-")

    assert(len(temperatureList) == 12)
    #df_tempMonthList = pd.DataFrame.from_dict(temperatureList)

    header = ["Year", "Month", "", "Within 10 km", "Within 50 km", "Within 100 km", "Within 250 km", "Within 500 km", "Within 1000 km"]
    df_counts = pd.read_csv(count_file, delimiter="\s+", header=None, comment="%", names=header, usecols = [0,1,3,4,5,6,7,8], encoding='latin-1')
    header = ["Year", "Month",  "Monthly Anomaly", "Monthly Unc.", "Annual Anomaly", "Annual Unc.",   "Five-year Anomaly", "Five-year Unc.", "Ten-year Anomaly", "Ten-year Unc.",  "Twenty-year Anomaly", "Twenty-year Unc."]
    df_trends = pd.read_csv(trends_file, delimiter="\s+", header=None, comment="%", names=header, usecols = [0,1,2,3], encoding='latin-1')
    
    # Drop Records based on the distance of the record stations
    df_counts = df_counts[df_counts["Within 250 km"] > 0]
    if len(df_counts) == 0:
        return None

    df_joined = pd.merge(df_counts, df_trends, how='left', left_on=['Year', 'Month'], right_on=['Year', 'Month'])
    #print(df_joined)
    #df_joined['temp'] = df_joined['Monthly Anomaly'] + temperatureList[df_joined['Month']]
    df_joined['AverageTemperature'] = df_joined.apply(lambda x: x['Monthly Anomaly'] + temperatureList[x['Month'].astype(int) - 1], axis=1)
    df_joined["Latitude"] = latlon[0]
    df_joined["Longitude"] = latlon[1]
    df_joined["Country"] = country
    df_joined["City"] = citys
    df_joined["dt"] = df_joined.apply(lambda x: str(x['Year']) + "-" + '{0:0>2}'.format(x['Month']) + "-01", axis=1)
    df_joined.rename(columns={"Monthly Unc.": "AverageTemperatureUncertainty"}, inplace=True)

    #df_joined.drop(['Within 10 km','Within 50 km','Within 100 km','Within 250 km','Within 500 km','Within 1000 km','Monthly Anomaly'], axis=1, inplace=True)
    df_joined = df_joined[["dt", "AverageTemperature", "AverageTemperatureUncertainty", "City", "Country", "Latitude", "Longitude"]]
    return df_joined


def getPositionsFromDirectory(dir):
    positions = set()
    for path in os.listdir(dir):
        if not os.path.isfile(os.path.join(dir, path)):
            continue
        if not "-TAVG-Trend.txt" in path:
            continue
        positions.add(path.replace("-TAVG-Trend.txt", ""))
    return positions

allPositions = getPositionsFromDirectory(LOCAL_FILE_PATH)
print(f"{len(allPositions)} different Location-Files will be combined")
df_merged = pd.DataFrame({'A' : []})
pbar = tqdm(total=len(allPositions), desc="Merging files")
for ind, positionName in enumerate(allPositions):
    pbar.update(1)
    pbar.set_description(f"Merging files ({len(df_merged)} temp entries)")
    #pbar.write(f"Working on {positionName}...")
    df = getDataForOnePosition(positionName)

    if df is None:
        continue
    if len(df) < 0:
        #pbar.write(f" -> Returned empty dataframe")
        continue

    #pbar.write(f" -> Read {len(df)} entries")
    if len(df_merged) > 0:
        df_merged = pd.concat([df_merged, df], ignore_index=True)
    else:
        df_merged = df
    
pbar.close()

#df_merged['src'] = 0

size_before = len(df_merged)
df_merged = df_merged.dropna()
print(f"Dropped {size_before - len(df_merged)} NaN-entries.")
df_merged.to_csv(OUTPUT_FILE, index=False, sep=",", encoding="utf-8", header=True)
print(f"Output-File created successfully")