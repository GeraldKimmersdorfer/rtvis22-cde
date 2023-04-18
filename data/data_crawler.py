import requests
import sys
from lxml import etree
import os
from tqdm import tqdm

LOCAL_FILE_PATH = "data/sources/berkley_local_summaries"
SKIP_DOWNLOAD = True # download step is unnecessary (look at note in step 1)

def exitWithError(msg):
    print(msg, file=sys.stderr)
    exit(-1)


def getSiteDom(url):
    resp = requests.get(url)
    if resp.status_code != 200:
        exitWithError(f"Couldn't download url {url}")
    return etree.HTML(resp.text)

def getCityLinkList():
    url_citylist = "http://berkeleyearth.lbl.gov/city-list/"
    ret = []
    dom = getSiteDom(url_citylist)
    elements = dom.xpath("//div[@class='pagination']//a[@class='pagination-fixed-width']")
    for element in elements:
        ret.append(element.get("href"))
    return ret

# Returns a set of all possible local positions that can be queried for later
# Note: berkleyearth doesnt really support individual cities but combines several testing stations around certain geographical coordinates. (here is one for example: http://berkeleyearth.lbl.gov/auto/Local/TAVG/Text/5.63N-8.07E-TAVG-Trend.txt)
def getAllLocalPositions(citylinks):
    ret = set()
    for url in tqdm(citylinks, desc="Fetching local positions"):
        dom = getSiteDom(url)
        elements = dom.xpath("//div[contains(concat(' ', @class, ' '), ' main-content ')]//table//tr/td[1]/a")
        for e in elements:
            u = e.get("href")
            l = u.rsplit('/', 1)[-1]
            ret.add(l)
    return ret


################################################################
# STEP 1: Download all local position temperature Files:
# NOTE: Nice code and it works but it's unnecessary, because all of the files (and even more) can be downloaded here:
# http://berkeleyearth.lbl.gov/auto/Local/TAVG/Text/
################################################################
if not SKIP_DOWNLOAD:
    cityUrls = getCityLinkList()
    localPositions = getAllLocalPositions(cityUrls)

    print(f"About to download {len(localPositions)} data-files into {LOCAL_FILE_PATH}.")

    os.makedirs(LOCAL_FILE_PATH, exist_ok=True)
    for pos in tqdm(localPositions, desc="Downloading TAVG-files"):
        url = f"http://berkeleyearth.lbl.gov/auto/Local/TAVG/Text/{pos}-TAVG-Trend.txt"
        localName = f"{LOCAL_FILE_PATH}/{pos}-TAVG-Trend.txt"
        resp = requests.get(url)
        if resp.status_code != 200:
            exitWithError(f"Couldn't download file {url}")
        open(localName, "wb").write(resp.content)

