# The overview of each localization sites

## zh-cn
- Get total count from one request: YES. From https://xkcd.in/  <input type="hidden" id="data_counts" value="1516"> document.querySelector("#data_counts").value
- Get all ids from one page: N/A
    - First get all the pages count from https://xkcd.in, can reuse last request output <input type="hidden" id="page_counts" value="32"> document.querySelector("#page_counts").value, 
    - Iterate through all the pages and get all the ids from each page, https://xkcd.in/?lg=cn&page=1
        - <div id="strip_list">
                <a href="/comic?lg=cn&amp;id=3136" onfocus="this.blur();">[3136]  拉</a>
                ...
- Are there missing ids in the middle of the index list: Yes.
- Ramdomly update new comics: Yes. But very likely to be new comics in the first page.
- Update frequency forecast: serveral days.
- Crawling frequency: every 15 minutes.
- Tricks: Reuse the request output to check newly added comics if total number has changed. as they comes in the same page.
- total ids right now: 1516.
- Latest id diff compared to the official site: 19, 3155-3136



## zh-tw
- Get total count from one request: YES. From https://xkcd.tw/, since all ids are in one page.
- Get all ids from one page: YES. <li><a href="/2904"><span>2904</span> 物理 vs 魔法</a></li>, use regex to get the id.
- Are there missing ids in the middle of the index list: Yes.
- Ramdomly update new comics: Yes.
- Update frequency forecast: serveral weeks.
- Crawling frequence: daily
- Tricks: n/a
- total ids right now: 676
- Latest id diff compared to the official site: 177, 3155-2978

## fr
- Get total count from one request: YES. From https://xkcd.lapin.org/tous-episodes.php, since all ids are in one page.
- Get all ids from one page: YES. <a href='index.php?number=1'>, use regex to get the id.
- Are there missing ids in the middle of the index list: No.
- Ramdomly update new comics: No.
- Update frequency forecast: never.
- Crawling frequence: daily, make sure the cost is just the smallest CPU time.
- Tricks: be careful with French when doing regex, e.g. d'espagnol contains '
- TODO: check why id=852 is missing in D1 database. It is shown on KV as well.
- total ids right now: 981
- Latest id diff compared to the official site: 2174, 3155-981


## ru
- Get total count from one request: YES. From https://xkcd.ru/num/, since all ids are in one page.
- Get all ids from one page: YES. <li class="real "><a href="/{id}/">{id}</a></li>, use regex to get the id.
- Are there missing ids in the middle of the index list: Yes.
- Ramdomly update new comics: Yes.
- Update frequency forecast: never, uncertain.
- Crawling frequence: daily, make sure the cost is just the smallest CPU time.
- Tricks: n/a
- TODO: crawling not complted
- total ids right now: 1851
- Latest id diff compared to the official site: 1304, 3155-1851


## de
- Get total count from one request: YES. From the svg directory https://xkcde.dapete.net/comics/svg/
- Get all ids from one page: NO. 
- Are there missing ids in the middle of the index list: Yes.
- Ramdomly update new comics: Yes.
- Update frequency forecast: never, now updates in last 4 years.
- Crawling frequence: daily, make sure the cost is just the smallest CPU time. Check https://xkcde.dapete.net/rss.php for any new updates.
- Tricks: there is no way to get all the ids. Have to iterate page by page.
- total ids right now: unknown, about 350
- Latest id diff compared to the official site: 1993, 3155-1162


## es
- Get total count from one request: YES. From https://es.xkcd.com/archive/   <div class="archive-entry">
- Get all ids from one page: NO.
- Are there missing ids in the middle of the index list: Yes.
- Ramdomly update new comics: Yes.
- Update frequency forecast: several months.
- Crawling frequence: daily.
- Tricks: there is no id until single comic is loaded.
- total ids right now: 257
- Latest id diff compared to the official site: 62, 3155-3093
