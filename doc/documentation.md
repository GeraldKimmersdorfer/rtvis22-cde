% Climate Difference Explorer - Documentation
% Gerald Kimmersdorfer, Dominik Wolf
% January 11, 2023

# About

The Climate Difference Explorer is an interactive web application that enables users to investigate variations in temperature across two specified time ranges. This application is developed using TypeScript and utilizes WebGPU to provide efficient and performant visualizations.

# Data Source

The application uses the [_Climate Change: Earth Surface Temperature Data_](https://www.kaggle.com/datasets/berkeleyearth/climate-change-earth-surface-temperature-data) dataset, sourced from [Berkeley Earth](http://berkeleyearth.org/about/). This dataset includes historical average land temperatures dating back to 1750 and extending up to 2013, and is provided in CSV format. Specifically, the tool utilizes the _Global Land Temperatures By City_ data, which includes monthly temperature averages for various cities, as well as geographical coordinates (latitude and longitude) to enable data aggregation and visualization.

# Data Preprocessing

The Climate Difference Explorer uses a custom offline data processing pipeline to convert the raw CSV data into a format that is more suitable for the visualization. Furthermore, the pipeline also performs data compression to reduce the size of the data file, which is served to the client. The pipeline is implemented in Python and the resulting file is served to the client together with the application.

The preprocessing pipeline performs the following steps:

## Step 1: Data Interpolation

The first step in the pipeline is to interpolate the data to fill in missing average temperature values via linear regression. The interpolation is performed on a per-city and per-month basis, and is done by first computing a linear regression model utilizing existing values, and then using the model to predict the missing temperature values.

## Step 2: Data Compression

The second step in the pipeline is to compress the data with the following steps:

* Getting rid of unnecessary data (like city names and countries)
* Creation of a lookuptable for the different positions inside the dataset
* Saving dates as month difference to the first date in the database
* Converting numbers into the smallest binary representation possible
* Discretizing temperature values.

The resulting data is then stored in a binary LZMA ([Lempel-Ziv-Markov chain algorithm](https://en.wikipedia.org/wiki/Lempel%E2%80%93Ziv%E2%80%93Markov_chain_algorithm)) compressed format, which is more compact than the original CSV format. This is done to reduce the size of the data file, which is served to the client. By the just described steps we achieved an overall compression rate of 98,61% (for 2 byte discretization) or 99,41% (for 1 byte discretization)

# Visualization

A custom visualization is implemented using TypeScript and WebGPU to provide efficient and performant rendering. The code is transpiled to JavaScript and executed in the client browser.

The steps of the visualization pipeline are as follows:

## Step 1: Data Loading

In the first step, the compressed data file is loaded into memory and decompressed in the client browser by reversing the process described in the _Data Preprocessing_ section. The decompressed data is then transferred to the GPU utilizing WebGPU buffer.

## Step 2: Grid Creation and Data Aggregation

The second step involves creating a hexagonal grid and aggregat the data into its cells. This is done by using a WebGPU compute shader, which sums the temperature values within each cell for both time ranges to be compared, and then calculates the average temperature for each cell by dividing the sums by the number of summed data points. A second compute shader then finds the minimum and maximum values for the entire grid, which are used to determine the color shading of the grid cells.

## Step 3: Data Rendering

In the final step, a world map is rendered on the canvas. The hexagonal grid cells are then overlaid on the map and shaded according to the calculated temperature difference values. The resulting visualization provides a representation of the data that allows to quickly see temperature differences in various areas around the world.

# User Interface

Since the WebGPU standard is still in its early stages of development, the application can currently only be used on the latest version of Google Chrome Canary.

After opening the application in the browser, the data is loaded and unpacked.

![](images/loading.png)

Once finished, the visualization is rendered on the canvas. The application is divided into three sections:

1. The **visualization**, which encompasses the entire screen and includes a legend, displays the selected data on a world map.
2. The **configuration window** allows users to select the year ranges to compare and adjust various display options.
3. The **information window** provides an overview of the currently displayed data, technical information, and a brief help guide.

## Visualization

The visualization groups the underlying data into hexagonal bins, each of which represents a specific geographic area. Data points within each bin are aggregated into a single value, which is then represented by the color of the hexagon. The color of the hexagon indicates the change in the average temperature by comparing the selected year ranges. The legend, which provides context for the colors used in the hexagons, is displayed at the bottom of the visualization. If a bin has no data points, it will appear transparent by default.

![](images/start.png)

When the mouse cursor is placed over a hexagon, additional information about the bin is displayed as a tooltip. This information includes, among others, the grid coordinates of the bin and the exact value of the aggregated data points within the bin.

![](images/hover.png)

## Configuration Window

The configuration window is organized into three sections:

1. The **Time Selection** section allows to select the date ranges for comparison.
2. The **Grid Settings** section provides options for configuring the hexagonal grid in the visualization.
3. The **Color Settings** section allows to adjust the colors used in the visualization.

### Time Selection

The Time Selection section enables users to select two year ranges for comparison. Users can select the start and end years for Time Range A and Time Range B using sliders. Additionally, a drop-down menu allows users to choose whether to compare the average temperature values for the entire year or for a specific month.

![](images/configuration-time.png)

### Grid Settings



![](images/configuration-grid.png)
