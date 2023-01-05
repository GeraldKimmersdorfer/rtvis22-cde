from pathlib import Path
from time import perf_counter

import numpy as np
import pandas as pd
from sklearn import linear_model

input_filepath = r'C:/tmp/rtvis22-cde/data/source/GlobalLandTemperaturesByCity.csv'
#row_sample = 1.0 # keeps x% of rows in output (for faster debugging)


def fill_nans(group):
    # skip if there are no NaNs
    if group['AverageTemperature'].isna().sum() == 0:
        return group

    # get non-NaN values for model fitting
    X = group[group['AverageTemperature'].notna()]['dt'].dt.year.values.reshape(-1, 1)
    y = group[group['AverageTemperature'].notna()]['AverageTemperature'].values

    # fit linear regression model
    model = linear_model.LinearRegression().fit(X, y)

    # predict temperature values for years
    predicted_temperatures = model.predict(group['dt'].dt.year.values.reshape(-1, 1))

    # fill NaNs with predictions
    group['src'] = np.where(group['AverageTemperature'].isna(), 1, group['src'])
    group['AverageTemperature'] = np.where(group['AverageTemperature'].isna(), predicted_temperatures, group['AverageTemperature'])

    # assert no NaNs left
    assert group['AverageTemperature'].isna().sum() == 0

    return group


def main():
    #if row_sample < 1.0:
    #    input(f"Just an information: I will delete {(1.0-row_sample)*100}% of rows by random. Press enter if you want to continue...")

    source_path = Path(input_filepath)
    dest_path = source_path.parent / (source_path.stem + '_interpolated.csv')

    overall_start = perf_counter()

    print('Loading data...', end='')
    start = perf_counter()
    df = pd.read_csv(source_path)
    print(f' {perf_counter() - start:.2f}s')

    # convert timestamps for easier grouping by year and month
    print('Converting timestamps...', end='')
    start = perf_counter()
    df['dt'] = pd.to_datetime(df['dt'])
    print(f' {perf_counter() - start:.2f}s')

    # add extra column so we know which values are interpolated:
    df['src'] = 0

    # group cities by month and apply linear regression interpolation to fill NaNs
    print('Filling NaNs...', end='')
    start = perf_counter()
    df = df.groupby([df['dt'].dt.month, 'Country', 'City', 'Latitude', 'Longitude'], sort=False, group_keys=True).apply(fill_nans).reset_index(drop=True)
    print(f' {perf_counter() - start:.2f}s')

    #if row_sample < 1.0:
    #    df = df.sample(frac=row_sample)

    df.sort_values(by=['City', 'dt'], inplace=True)

    # save to file
    print('Saving data...', end='')
    start = perf_counter()
    df.to_csv(dest_path, index=False)
    print(f' {perf_counter() - start:.2f}s')

    print(f'Overall time: {perf_counter() - overall_start:.2f}s')


if __name__ == '__main__':
    main()
