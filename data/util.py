
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