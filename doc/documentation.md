# Climate Difference Explorer

The Climate Difference Explorer is an interactive web application that enables users to investigate variations in temperature across two specified time ranges. This application is developed using TypeScript and utilizes WebGPU to provide efficient and performant visualizations.

## Data Source

The application uses the [_Climate Change: Earth Surface Temperature Data_](https://www.kaggle.com/datasets/berkeleyearth/climate-change-earth-surface-temperature-data) dataset, sourced from [Berkeley Earth](http://berkeleyearth.org/about/). This dataset includes historical average land temperatures dating back to 1750 and extending up to 2013, and is provided in CSV format. Specifically, the tool utilizes the _Global Land Temperatures By City_ data, which includes monthly temperature averages for various cities, as well as geographical coordinates (latitude and longitude) to enable data aggregation and visualization.

## Data Preprocessing

The Climate Difference Explorer uses a custom offline data processing pipeline to convert the raw CSV data into a format that is more suitable for the visualization. Furthermore, the pipeline also performs data compression to reduce the size of the data file, which is served to the client. The pipeline is implemented in Python and the resulting file is served to the client together with the application.

The preprocessing pipeline performs the following steps:

### Step 1: Data Interpolation

The first step in the pipeline is to interpolate the data to fill in missing average temperature values via linear regression. The interpolation is performed on a per-city and per-month basis, and is done by first computing a linear regression model utilizing existing values, and then using the model to predict the missing temperature values.

### Step 2: Data Compression

The second step in the pipeline is to compress the data by discretizing the temperature values, coordinates, and coordinates. The resulting data is then stored in a binary LZMA ([Lempel-Ziv-Markov chain algorithm](https://en.wikipedia.org/wiki/Lempel%E2%80%93Ziv%E2%80%93Markov_chain_algorithm)) compressed format, which is more compact than the original CSV format. This is done to reduce the size of the data file, which is served to the client.

## Visualization

A custom visualization is implemented using TypeScript and WebGPU to provide efficient and performant rendering. The code is transpiled to JavaScript and executed in the client browser.

The steps of the visualization pipeline are as follows:

### Step 1: Data Loading

In the first step, the compressed data file is loaded into memory and decompressed in the client browser by reversing the process described in the _Data Preprocessing_ section. The decompressed data is then transferred to the GPU using a WebGPU buffer.

### Step 2: Data Aggregation

The second step involves aggregating the data into a grid of hexagonal cells. This is done by using a WebGPU compute shader, which sums the temperature values within each cell for both time ranges to be compared, and then calculates the average temperature for each cell by dividing the sums by the number of data points. A second compute shader then finds the minimum and maximum values for the entire grid, which are used to determine the color shading of the grid cells.

### Step 3: Data Rendering

In the final step, a world map is rendered on the canvas. The hexagonal grid cells are then overlaid on the map and shaded according to the calculated temperature difference values. The resulting visualization provides a representation of the data that allows to quickly see trends in the temperature differences.

## User Interface

Since the WebGPU standard is still in its early stages of development, the application can currently only be used on the latest version of Google Chrome Canary.

