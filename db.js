
const oracledb = require('oracledb');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

let poolPromise;

async function getPool() {
    if (!poolPromise) {
        poolPromise = oracledb.createPool({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASSWORD,
            connectString: process.env.ORACLE_CONNECT_STRING,
            poolMin: 0,
            poolMax: 2,
            poolIncrement: 1
        }).catch(error => {
            poolPromise = null;
            throw error;
        });
    }

    return poolPromise;
}

async function query(sql, binds = {}) {
    const pool = await getPool();
    const connection = await pool.getConnection();

    try {
        return await connection.execute(sql, binds, {
            autoCommit: true,
            outFormat: oracledb.OUT_FORMAT_OBJECT
        });
    } finally {
        await connection.close();
    }
}

module.exports = { query };
