import pandas as pd
from IPython.display import display

# Takes a lat, long string with letters NSEW and converts them into degrees floats
# more info: https://www.earthpoint.us/convert.aspx#PositionColumn
def tolatlongfloat(lat, long):
    if "N" in lat:
        lat = float(lat.replace("N", ""))
    elif "S" in lat:
        lat = -float(lat.replace("S", ""))
    if "E" in long:
        long = float(long.replace("E", ""))
    elif "W" in long:
        long = -float(long.replace("W", ""))
    return (lat, long)    

def df_print_rows(df, rowCount):
    with pd.option_context('display.max_rows', 1500, 'display.max_columns', 15):
        display(df.head(1500)) #need display to show the dataframe when using with in jupyter