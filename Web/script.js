let mapping = {};

async function loadMapping() {
    try {
        const response = await fetch('./mapping.json');
        if (!response.ok) throw new Error("无法加载 mapping.json");
        return await response.json();
    } catch (error) {
        console.error(error);
        return {};
    }
}

const AppState = {
    isSearching: false,
    randomStringDisplayed: false,
    searchResults: [],
    currentPage: 1,
    itemsPerPage: 20,
    hasMoreResults: true,
    cachedResults: [],
    displayedCount: 0
};


const CONFIG = {
    randomStrings: ["探索VV的开源世界", "为东大助力", "搜索你想要的内容"],
    apiBaseUrl: ''
};


class UIController {
    static updateSearchFormPosition(isSearching) {
        const searchForm = document.getElementById('searchForm');
        const randomStringDisplay = document.getElementById('randomStringDisplay');
        
        if (isSearching) {
            searchForm.classList.add('searching');
            if (!AppState.randomStringDisplayed) {
                this.showRandomString();
            }
        } else {
            searchForm.classList.remove('searching');
            if (AppState.cachedResults.length > 0) {
                this.clearRandomString();
            }
        }
    }

    static showRandomString() {
        if (!AppState.randomStringDisplayed) {
            const randomStringDisplay = document.getElementById('randomStringDisplay');
            const randomIndex = Math.floor(Math.random() * CONFIG.randomStrings.length);
            randomStringDisplay.textContent = CONFIG.randomStrings[randomIndex];
            AppState.randomStringDisplayed = true;
            
            randomStringDisplay.classList.remove('fade-out');
            randomStringDisplay.classList.add('fade-in');
        }
    }

    static clearRandomString() {
        const randomStringDisplay = document.getElementById('randomStringDisplay');
        randomStringDisplay.classList.remove('fade-in');
        randomStringDisplay.classList.add('fade-out');
        
        setTimeout(() => {
            randomStringDisplay.textContent = '';
            AppState.randomStringDisplayed = false;
        }, 300);
    }
}

class SearchController {
    static async performSearch(query, minRatio, minSimilarity) {
        const url = `${CONFIG.apiBaseUrl}/search?query=${encodeURIComponent(query)}&min_ratio=${minRatio}&min_similarity=${minSimilarity}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("网络请求失败");
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let totalBytes = 0;
            
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, {stream: true});
                totalBytes += value.length;
                
                const progress = Math.min(90, (totalBytes / response.headers.get('Content-Length')) * 100);
                document.getElementById('loadingBar').style.width = `${progress}%`;
                
                let lines = buffer.split('\n');
                buffer = lines.pop();
                
                for (let line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const result = JSON.parse(line);
                        if (result) {
                            AppState.cachedResults.push(result);
                        }
                    } catch (e) {
                        console.warn('解析单个结果失败:', e);
                    }
                }
            }
            
            if (buffer.trim()) {
                try {
                    const result = JSON.parse(buffer);
                    if (result) {
                        AppState.cachedResults.push(result);
                    }
                } catch (e) {
                    console.warn('解析最后的结果失败:', e);
                }
            }
            
            if (AppState.cachedResults.length > 0) {
                displayResults({
                    status: 'success',
                    data: AppState.cachedResults,
                    count: AppState.cachedResults.length
                }, false);
                
                return {
                    status: 'success',
                    data: AppState.cachedResults,
                    count: AppState.cachedResults.length
                };
            } else {
                return {
                    status: 'success',
                    data: [],
                    count: 0
                };
            }
        } catch (error) {
            console.error('搜索错误:', error);
            throw error;
        } finally {
            completeLoadingBar();
        }
    }

    static validateSearchInput(query) {
        return query.trim() !== "";
    }
}

async function handleSearch(mapping) {
    const query = document.getElementById('query').value.trim();
    const minRatio = document.getElementById('minRatio').value;
    const minSimilarity = document.getElementById('minSimilarity').value;

    if (!SearchController.validateSearchInput(query)) {
        alert("请输入搜索关键词！");
        return;
    }

    try {
        startLoadingBar();
        UIController.showRandomString();
        UIController.updateSearchFormPosition(true);
        document.getElementById('results').innerHTML = '';
        
        AppState.currentPage = 1;
        AppState.cachedResults = [];
        AppState.displayedCount = 0;
        AppState.hasMoreResults = true;

        await SearchController.performSearch(query, minRatio, minSimilarity);
        
        initializeScrollListener();

    } catch (error) {
        console.error('搜索失败:', error);
        document.getElementById('results').innerHTML = '<div class="result-card">搜索失败，请稍后重试</div>';
    } finally {
        UIController.updateSearchFormPosition(false);
    }
}

async function initializeApp() {
    try {
        mapping = await loadMapping();
        initializeScrollListener();
        
        document.getElementById('searchForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (AppState.isSearching) return;
            
            AppState.isSearching = true;
            try {
                await handleSearch(mapping);
            } finally {
                AppState.isSearching = false;
            }
        });

       
        document.getElementById('query').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (AppState.isSearching) return;
                document.getElementById('searchForm').dispatchEvent(new Event('submit'));
            }
        });

        document.getElementById('refreshDiv').addEventListener('click', function() {
            location.reload();
        });

        
    } catch (error) {
        console.error('初始化失败:', error);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    initializeApp();

    const toggleButton = document.getElementById('toggleAdvancedOptions');
    const advancedOptions = document.getElementById('advancedOptions');
    
    toggleButton.addEventListener('click', () => {
        const isExpanded = advancedOptions.classList.contains('show');
        
        if (!isExpanded) {

            advancedOptions.style.transition = 'none';
            advancedOptions.classList.add('show');
            const height = advancedOptions.scrollHeight;
            advancedOptions.classList.remove('show');
            
            void advancedOptions.offsetHeight;
            advancedOptions.style.transition = '';
            advancedOptions.style.maxHeight = height + 'px';
            advancedOptions.classList.add('show');
        } else {
            advancedOptions.style.maxHeight = '0';
            advancedOptions.classList.remove('show');
        }
        
        toggleButton.classList.toggle('active');
        toggleButton.setAttribute('aria-expanded', !isExpanded);
    });
});

function displayResults(data, append = false) {
    const resultsDiv = document.getElementById('results');
    
    if (!append) {
        resultsDiv.innerHTML = '';
        AppState.displayedCount = 0;
    }
    
    if (data.status !== 'success' || (!append && data.count === 0)) {
        if (!append) {
            resultsDiv.innerHTML = '<div class="result-card">未找到匹配结果</div>';
        }
        AppState.hasMoreResults = false;
        return;
    }

    const startIndex = AppState.displayedCount;
    const endIndex = Math.min(startIndex + AppState.itemsPerPage, data.data.length);
    const newResults = data.data.slice(startIndex, endIndex);

    if (endIndex >= data.data.length) {
        AppState.hasMoreResults = false;
    }

    newResults.forEach(result => {
        const episodeMatch = result.filename.match(/\[P(\d+)\]/);
        const timeMatch = result.timestamp.match(/^(\d+)m(\d+)s$/);
        
        let imageUrl = '';
        if (episodeMatch && timeMatch) {
            const episodeNum = parseInt(episodeMatch[1], 10);
            const totalSeconds = parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
            imageUrl = `frames/${episodeNum}/frame_${totalSeconds}.webp`;
        }

        const cleanFilename = result.filename
            .replace(/\[P(\d+)\].*?\s+/, 'P$1 ')
            .replace(/\.json$/, '')
            .trim();

        const card = document.createElement('div');
        card.className = 'result-card';
        
        const cardContent = `
            <div class="result-content">
                <h3><span class="tag">${cleanFilename.match(/P\d+/)}</span>${cleanFilename.replace(/P\d+/, '').trim()}</h3>
                <p class="result-text">${result.text}</p>
                <p class="result-meta">${result.timestamp} · 匹配度 ${parseFloat(result.match_ratio).toFixed(1)}% · 相似度 ${(result.similarity * 100).toFixed(1)}%</p>
            </div>
        `;

        if (imageUrl) {
            const img = new Image();
            img.src = imageUrl;
            img.className = 'preview-frame';
            img.loading = 'lazy';
            
            img.onerror = () => {
                card.innerHTML = cardContent;
            };
            
            img.onload = () => {
                card.innerHTML = img.outerHTML + cardContent;
            };
        }
        
        card.innerHTML = cardContent;

        card.addEventListener('click', () => handleCardClick(result));
        resultsDiv.appendChild(card);
    });

    AppState.displayedCount = endIndex;
    AppState.hasMoreResults = endIndex < data.data.length;

    const trigger = document.getElementById('scroll-trigger');
    if (trigger) {
        resultsDiv.appendChild(trigger);
    }
}

function getEpisodeUrl(filename) {
    for (let key in mapping) {
        if (mapping[key] === filename) {
            return key;
        }
    }
    return null;
}


function startLoadingBar() {
    const loadingBar = document.getElementById('loadingBar');
    loadingBar.style.width = "0%";
    loadingBar.style.display = "block";

    if (loadingBar.interval) {
        clearInterval(loadingBar.interval);
    }
    
    let progress = 0;
    loadingBar.interval = setInterval(() => {
        const currentWidth = parseFloat(loadingBar.style.width);
        if (currentWidth > progress + 1) {
            clearInterval(loadingBar.interval);
            return;
        }
        
        progress += 0.2;
        if (progress > 90) {
            clearInterval(loadingBar.interval);
            progress = 90;
        }
        loadingBar.style.width = `${progress}%`;
    }, 50);
}

function completeLoadingBar() {
    const loadingBar = document.getElementById('loadingBar');
    clearInterval(loadingBar.interval);
    
    loadingBar.style.transition = 'width 0.3s ease-out';
    loadingBar.style.width = "100%";
    
    setTimeout(() => {
        loadingBar.style.display = "none";
        loadingBar.style.transition = '';
        loadingBar.style.width = "0%";
    }, 300);
}


function initializeScrollListener() {
    if (window.currentObserver) {
        window.currentObserver.disconnect();
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && 
                AppState.hasMoreResults && 
                !AppState.isSearching && 
                AppState.cachedResults.length > AppState.displayedCount) {
                
                displayResults({
                    status: 'success',
                    data: AppState.cachedResults,
                    count: AppState.cachedResults.length
                }, true);
            }
        });
    }, {
        root: null,
        rootMargin: '200px',
        threshold: 0.1
    });

    window.currentObserver = observer;

    const oldTrigger = document.getElementById('scroll-trigger');
    if (oldTrigger) {
        oldTrigger.remove();
    }

    const trigger = document.createElement('div');
    trigger.id = 'scroll-trigger';
    trigger.style.cssText = 'height: 20px; margin: 20px 0;';
    document.getElementById('results').appendChild(trigger);
    
    observer.observe(trigger);
}

function handleCardClick(result) {
    const episodeMatch = result.filename.match(/\[P(\d+)\]/);
    const timeMatch = result.timestamp.match(/^(\d+)m(\d+)s$/);
    
    if (episodeMatch && timeMatch) {
        const episodeNum = parseInt(episodeMatch[1], 10);
        const minutes = parseInt(timeMatch[1]);
        const seconds = parseInt(timeMatch[2]);
        const totalSeconds = minutes * 60 + seconds;
        
        for (const [url, filename] of Object.entries(mapping)) {
            if (filename === result.filename) {
                const videoUrl = `https://www.bilibili.com${url}?t=${totalSeconds}`;
                window.open(videoUrl, '_blank');
                break;
            }
        }
    }
}