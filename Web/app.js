let db;
let currentQuery = '';
let currentPage = 1;
let totalPages = 1;
const PAGE_SIZE = 20;

// IndexedDB 初始化函数
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('SubtitlesDB', 1);
        
        request.onerror = () => reject(request.error);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('database')) {
                db.createObjectStore('database', { keyPath: 'id' });
            }
        };
        
        request.onsuccess = () => resolve(request.result);
    });
}

// 初始化 SQL.js
async function initDB() {
    const loadingContainer = document.getElementById('loadingContainer');
    const mainContent = document.getElementById('mainContent');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    const SQL = await initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });
    
    const DB_VERSION = '1.0';
    
    try {
        const idb = await openDB();
        const tx = idb.transaction('database', 'readonly');
        const store = tx.objectStore('database');
        const cachedData = await new Promise((resolve, reject) => {
            const request = store.get('current');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });

        if (cachedData && cachedData.version === DB_VERSION) {
            progressText.textContent = '正在加载缓存数据...';
            progressBar.style.width = '100%';
            db = new SQL.Database(new Uint8Array(cachedData.data));
            console.log('Database loaded from IndexedDB cache');
        } else {
            // 从远程加载并显示进度
            const response = await fetch('https://vvdb.cicada000.work/subtitles.db');
            const reader = response.body.getReader();
            const contentLength = +response.headers.get('Content-Length');

            let receivedLength = 0;
            const chunks = [];

            while(true) {
                const {done, value} = await reader.read();
                
                if (done) break;
                
                chunks.push(value);
                receivedLength += value.length;
                
                // 更新进度
                const progress = (receivedLength / contentLength) * 100;
                progressBar.style.width = `${progress}%`;
                progressText.textContent = `正在下载数据库...${progress.toFixed(1)}%`;
            }

            const buf = await new Blob(chunks).arrayBuffer();
            
            // 保存到 IndexedDB
            progressText.textContent = '正在保存到本地...';
            const saveTx = idb.transaction('database', 'readwrite');
            const saveStore = saveTx.objectStore('database');
            await new Promise((resolve, reject) => {
                const request = saveStore.put({
                    id: 'current',
                    version: DB_VERSION,
                    data: buf
                });
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });

            db = new SQL.Database(new Uint8Array(buf));
        }

        // 完成加载，显示主界面
        setTimeout(() => {
            loadingContainer.style.display = 'none';
            mainContent.classList.add('show');
            document.querySelector('.search-container').classList.remove('searched');
            document.getElementById('mainContent').classList.remove('has-results');
        }, 500);

    } catch (err) {
        console.error('Error loading database:', err);
        progressText.textContent = '加载失败，请刷新重试';
        throw err;
    }
}

// 新建表结构
function createTable() {
    db.run(`
        CREATE TABLE IF NOT EXISTS subtitles (
            episode_title TEXT,
            timestamp TEXT,
            similarity REAL,
            text TEXT
        )
    `);
}

// 模糊匹配函数
function partialRatio(str1, str2) {
    str1 = str1.toLowerCase();
    str2 = str2.toLowerCase();
    
    if (str1.length > str2.length) {
        [str1, str2] = [str2, str1];
    }
    
    let maxRatio = 0;
    for (let i = 0; i <= str2.length - str1.length; i++) {
        const substring = str2.substr(i, str1.length);
        const matches = [...str1].filter((char, index) => char === substring[index]).length;
        const ratio = (matches / str1.length) * 100;
        maxRatio = Math.max(maxRatio, ratio);
    }
    
    return maxRatio;
}

async function search(page) {
    const query = document.getElementById('searchInput').value;
    const minRatio = parseInt(document.getElementById('minRatio').value);
    const loading = document.getElementById('loading');
    const resultsDiv = document.getElementById('results');
    const paginationDiv = document.getElementById('pagination');
    const searchContainer = document.querySelector('.search-container');
    const mainContent = document.getElementById('mainContent');
    
    // 如果是翻页操作平滑滚动到顶部
    if (page > 1 || currentPage > 1) {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
    
    loading.style.display = 'inline';
    currentQuery = query;
    currentPage = page;

    try {
        // 加载链接数据
        const linksResponse = await fetch('links.json');
        const episodeLinks = await linksResponse.json();
        
        let matchedResults = [];
        const results = db.exec('SELECT episode_title, timestamp, similarity, text FROM subtitles');
        
        if (results.length > 0) {
            const rows = results[0].values;
            
            if (query.includes(' ')) {
                // 严格搜索模式 - 完全匹配的结果
                const keywords = query.split(' ').filter(k => k);
                matchedResults = rows
                    .filter(row => keywords.every(keyword => row[3].includes(keyword)))
                    .map(row => ({
                        episode_title: row[0],
                        timestamp: row[1],
                        similarity: row[2],
                        text: row[3],
                        match_ratio: 100,
                        exact_match: row[3].includes(query)
                    }));
            } else {
                // 模糊搜索模式
                matchedResults = rows
                    .map(row => ({
                        episode_title: row[0],
                        timestamp: row[1],
                        similarity: row[2],
                        text: row[3],
                        match_ratio: partialRatio(query, row[3]),
                        exact_match: row[3].includes(query) // 添加完全匹配标志
                    }))
                    .filter(item => item.match_ratio >= minRatio);
            }
        }

        // 更新排序逻辑
        const sortedResults = matchedResults.sort((a, b) => {
            // 首先按完全匹配排序
            if (a.exact_match && !b.exact_match) return -1;
            if (!a.exact_match && b.exact_match) return 1;
            // 其次按匹配率排序
            return b.match_ratio - a.match_ratio;
        });

        // 排序并分页
        const start = (page - 1) * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        const pageResults = sortedResults.slice(start, end);

        totalPages = Math.ceil(sortedResults.length / PAGE_SIZE);

        // 清空并显示结果容器
        resultsDiv.style.visibility = 'visible';
        resultsDiv.style.opacity = '1';

        if (pageResults.length > 0) {
            // 添加搜索状态类
            searchContainer.classList.add('searched');
            mainContent.classList.add('has-results');
            
            resultsDiv.innerHTML = pageResults.map(result => {
                // 提取集数
                const episodeMatch = result.episode_title.match(/P(\d+)/);
                const episodeNumber = episodeMatch ? episodeMatch[1].replace(/^0+/, '') : null;
                
                // 转换时间戳为秒数
                const timeToSeconds = (timestamp) => {
                    // 匹配分钟和秒数，支持多种格式：5m30s、05:30、5:30 等
                    const timeMatch = timestamp.match(/(?:(\d+)[m:])?(\d+)s?/);
                    if (timeMatch) {
                        const minutes = parseInt(timeMatch[1] || '0');
                        const seconds = parseInt(timeMatch[2] || '0');
                        return minutes * 60 + seconds;
                    }
                    return 0;
                };

                // 在 links 对象中查找对应的链接
                let episodeLink = '#';
                if (episodeNumber) {
                    for (const [link, num] of Object.entries(episodeLinks)) {
                        if (num === episodeNumber) {
                            const totalSeconds = timeToSeconds(result.timestamp);
                            episodeLink = `${link}?share_source=copy_web&t=${totalSeconds}`;
                            break;
                        }
                    }
                }
                
                return `
                    <div class="result ${result.exact_match ? 'exact-match' : ''}" 
                         onclick="window.open('${episodeLink}', '_blank')" 
                         style="cursor: pointer;">
                        <div>剧集：${result.episode_title}</div>
                        <div>时间戳：${result.timestamp}</div>
                        <div>文本：${result.text}</div>
                        <div>匹配率：${result.match_ratio.toFixed(1)}%${result.exact_match ? ' (完全匹配)' : ''}</div>
                    </div>
                `;
            }).join('');

            // 为每个结果项添加动画
            const resultElements = document.querySelectorAll('.result');
            resultElements.forEach((element, index) => {
                setTimeout(() => {
                    element.classList.add('show');
                }, index * 100);
            });

            if (totalPages > 1) {
                paginationDiv.style.display = 'flex';
                updatePagination();
            } else {
                paginationDiv.style.display = 'none';
            }
        } else {
            // 无匹配结果时的显示
            searchContainer.classList.add('searched');
            mainContent.classList.add('has-results');
            resultsDiv.innerHTML = `
                <div class="no-results">
                    <p>未找到与"${query}"相关的匹配结果</p>
                    <p>建议：</p>
                    <ul>
                        <li>检查输入是否正确</li>
                        <li>尝试降低最小匹配率（当前：${minRatio}%）</li>
                        <li>尝试使用更简短的关键词</li>
                    </ul>
                </div>
            `;
            paginationDiv.style.display = 'none';
        }
    } catch (error) {
        resultsDiv.innerHTML = '搜索出错：' + error.message;
        resultsDiv.style.visibility = 'visible';
        searchContainer.classList.remove('searched');
        mainContent.classList.remove('has-results');
    } finally {
        loading.style.display = 'none';
    }
}

function updatePagination() {
    const paginationDiv = document.getElementById('pagination');
    
    // 创建分页 HTML
    paginationDiv.innerHTML = `
        <button class="page-btn prev-btn" onclick="search(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>&lt;</button>
        <div class="page-info">${currentPage}/${totalPages}</div>
        <button class="page-btn next-btn" onclick="search(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>&gt;</button>
    `;
}

// 添加回车键搜索事件监听
document.addEventListener('DOMContentLoaded', function() {
    const searchContainer = document.querySelector('.search-container');
    const mainContent = document.getElementById('mainContent');
    const resultsDiv = document.getElementById('results');
    const paginationDiv = document.getElementById('pagination');
    
    // 初始化时移除这些类
    searchContainer.classList.remove('searched');
    mainContent.classList.remove('has-results');
    
    // 隐藏分页和结果
    paginationDiv.style.display = 'none';
    resultsDiv.style.opacity = '0';
    resultsDiv.style.visibility = 'hidden';
    
    // 监听搜索输入框
    document.getElementById('searchInput').addEventListener('keypress', function(event) {
        if (event.key === 'Enter' || event.keyCode === 13) {
            event.preventDefault();
            search(1);
        }
    });

    // 监听最小匹配率输入框
    document.getElementById('minRatio').addEventListener('keypress', function(event) {
        if (event.key === 'Enter' || event.keyCode === 13) {
            event.preventDefault();
            search(1);
        }
    });
});

// 初始化数据库
initDB(); 