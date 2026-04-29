/**
 * SyncCinema Database Layer
 * 抽象数据库接口，支持 JSON 文件、MongoDB、PostgreSQL
 * 默认使用 JSON 文件存储（零配置，向后兼容）
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_TYPE = process.env.DB_TYPE || 'json'; // json | mongodb | postgresql
const JWT_SECRET = process.env.JWT_SECRET || 'synccinema-secret-key-change-in-production';

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ===== JSON 文件存储实现 =====

const jsonStores = {};
const jsonPaths = {
    users: path.join(DATA_DIR, 'users.json'),
    rooms: path.join(DATA_DIR, 'rooms.json'),
    messages: path.join(DATA_DIR, 'messages.json'),
    privateMessages: path.join(DATA_DIR, 'privateMessages.json')
};

function loadJsonFile(name) {
    const filePath = jsonPaths[name];
    if (!fs.existsSync(filePath)) {
        jsonStores[name] = [];
        saveJsonFile(name);
        return;
    }
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        jsonStores[name] = JSON.parse(data);
    } catch (e) {
        console.error(`加载 ${name}.json 失败:`, e);
        jsonStores[name] = [];
    }
}

function saveJsonFile(name) {
    const filePath = jsonPaths[name];
    const tempPath = filePath + '.tmp';
    try {
        fs.writeFileSync(tempPath, JSON.stringify(jsonStores[name] || [], null, 2));
        fs.renameSync(tempPath, filePath);
    } catch (e) {
        console.error(`保存 ${name}.json 失败:`, e);
    }
}

// 初始化所有 JSON 存储
Object.keys(jsonPaths).forEach(loadJsonFile);

// JSON 数据库操作
const jsonDB = {
    async find(collection, query = {}, options = {}) {
        let results = [...(jsonStores[collection] || [])];

        // 简单查询匹配
        if (Object.keys(query).length > 0) {
            results = results.filter(item => {
                return Object.entries(query).every(([key, value]) => {
                    if (typeof value === 'object' && value !== null) {
                        // 支持比较操作符: $gt, $gte, $lt, $lte, $ne, $in
                        if (value.$gt !== undefined) return item[key] > value.$gt;
                        if (value.$gte !== undefined) return item[key] >= value.$gte;
                        if (value.$lt !== undefined) return item[key] < value.$lt;
                        if (value.$lte !== undefined) return item[key] <= value.$lte;
                        if (value.$ne !== undefined) return item[key] !== value.$ne;
                        if (Array.isArray(value.$in)) return value.$in.includes(item[key]);
                    }
                    return item[key] === value;
                });
            });
        }

        // 排序
        if (options.sort) {
            const [sortKey, sortDir] = Object.entries(options.sort)[0];
            results.sort((a, b) => {
                if (sortDir === -1) return b[sortKey] > a[sortKey] ? 1 : -1;
                return a[sortKey] > b[sortKey] ? 1 : -1;
            });
        }

        // 限制数量
        if (options.limit) {
            results = results.slice(0, options.limit);
        }

        return results;
    },

    async findOne(collection, query) {
        const results = await this.find(collection, query);
        return results[0] || null;
    },

    async findById(collection, id) {
        const store = jsonStores[collection] || [];
        return store.find(item => item.id === id) || null;
    },

    async insert(collection, doc) {
        if (!jsonStores[collection]) jsonStores[collection] = [];
        jsonStores[collection].push(doc);
        saveJsonFile(collection);
        return doc;
    },

    async update(collection, query, update) {
        const store = jsonStores[collection] || [];
        let count = 0;
        store.forEach((item, index) => {
            const match = Object.entries(query).every(([key, value]) => item[key] === value);
            if (match) {
                if (update.$set) {
                    Object.assign(item, update.$set);
                } else {
                    Object.assign(item, update);
                }
                count++;
            }
        });
        if (count > 0) saveJsonFile(collection);
        return count;
    },

    async updateById(collection, id, update) {
        const store = jsonStores[collection] || [];
        const index = store.findIndex(item => item.id === id);
        if (index === -1) return 0;
        if (update.$set) {
            Object.assign(store[index], update.$set);
        } else {
            Object.assign(store[index], update);
        }
        saveJsonFile(collection);
        return 1;
    },

    async delete(collection, query) {
        const store = jsonStores[collection] || [];
        const originalLength = store.length;
        const newStore = store.filter(item => {
            return !Object.entries(query).every(([key, value]) => item[key] === value);
        });
        jsonStores[collection] = newStore;
        if (newStore.length !== originalLength) {
            saveJsonFile(collection);
        }
        return originalLength - newStore.length;
    },

    async deleteById(collection, id) {
        const store = jsonStores[collection] || [];
        const index = store.findIndex(item => item.id === id);
        if (index === -1) return 0;
        store.splice(index, 1);
        saveJsonFile(collection);
        return 1;
    },

    async push(collection, id, field, value) {
        const store = jsonStores[collection] || [];
        const item = store.find(i => i.id === id);
        if (!item) return 0;
        if (!Array.isArray(item[field])) item[field] = [];
        item[field].push(value);
        // 限制数组长度
        const maxLength = field === 'messages' ? 200 : 100;
        if (item[field].length > maxLength) {
            item[field] = item[field].slice(-maxLength);
        }
        saveJsonFile(collection);
        return 1;
    },

    // 获取内存中的集合（用于 rooms 等高频内存操作）
    getMemoryStore(collection) {
        return jsonStores[collection] || [];
    },

    // 保存内存中的集合到磁盘
    saveMemoryStore(collection) {
        saveJsonFile(collection);
    }
};

// ===== MongoDB 实现（占位，供后续扩展）=====
// 当 DB_TYPE === 'mongodb' 时，需要安装 mongodb 包并配置 MONGODB_URI
const mongoDB = {
    async find() { throw new Error('MongoDB 未实现，请先安装 mongodb 包并配置连接'); },
    async findOne() { throw new Error('MongoDB 未实现'); },
    async findById() { throw new Error('MongoDB 未实现'); },
    async insert() { throw new Error('MongoDB 未实现'); },
    async update() { throw new Error('MongoDB 未实现'); },
    async updateById() { throw new Error('MongoDB 未实现'); },
    async delete() { throw new Error('MongoDB 未实现'); },
    async deleteById() { throw new Error('MongoDB 未实现'); },
    async push() { throw new Error('MongoDB 未实现'); },
    getMemoryStore() { return []; },
    saveMemoryStore() {}
};

// ===== PostgreSQL 实现（占位，供后续扩展）=====
// 当 DB_TYPE === 'postgresql' 时，需要安装 pg 包并配置 DATABASE_URL
const pgDB = {
    async find() { throw new Error('PostgreSQL 未实现，请先安装 pg 包并配置连接'); },
    async findOne() { throw new Error('PostgreSQL 未实现'); },
    async findById() { throw new Error('PostgreSQL 未实现'); },
    async insert() { throw new Error('PostgreSQL 未实现'); },
    async update() { throw new Error('PostgreSQL 未实现'); },
    async updateById() { throw new Error('PostgreSQL 未实现'); },
    async delete() { throw new Error('PostgreSQL 未实现'); },
    async deleteById() { throw new Error('PostgreSQL 未实现'); },
    async push() { throw new Error('PostgreSQL 未实现'); },
    getMemoryStore() { return []; },
    saveMemoryStore() {}
};

// ===== 导出统一接口 =====

const db = DB_TYPE === 'mongodb' ? mongoDB : DB_TYPE === 'postgresql' ? pgDB : jsonDB;

module.exports = {
    db,
    JWT_SECRET,
    DB_TYPE
};
