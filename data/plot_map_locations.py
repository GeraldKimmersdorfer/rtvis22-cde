import csv

import cartopy.crs as ccrs
import matplotlib.pyplot as plt

input_filepath = 'source/GlobalLandTemperaturesByCity.csv'

lat_long_map = {
    'N': 1,
    'S': -1,
    'E': 1,
    'W': -1,
}


def map_lat_long(lat, long):
    return float(lat[:-1]) * lat_long_map[lat[-1]], float(long[:-1]) * lat_long_map[long[-1]]


def main():
    # stores locations and their corresponding city names
    points = {}

    with open(input_filepath, 'r', encoding='utf-8') as f:
        f.readline()  # skip header
        csv_reader = csv.reader(f)
        for row in csv_reader:
            point = map_lat_long(row[5], row[6])
            if point not in points:
                points[point] = set()
            points[point].add(row[3])  # add city name

    fig = plt.figure(figsize=(20, 10))
    ax = fig.add_subplot(1, 1, 1, projection=ccrs.PlateCarree())
    ax.set_global()
    ax.coastlines()

    x, y, s = [], [], []
    for (lat, long), cities in points.items():
        x.append(long)
        y.append(lat)
        s.append(20 + len(cities) * 5)

    # ax.hexbin(x, y, gridsize=(100, 30), transform=ccrs.PlateCarree())
    ax.scatter(x, y, s=s, c='r', edgecolors='k', linewidths=.5, transform=ccrs.PlateCarree())

    plt.tight_layout()

    plt.show()


if __name__ == '__main__':
    main()
