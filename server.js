
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const db = require('./db');

const app = express();

// ==========================================
// MIDDLEWARE
// ==========================================

const allowedOrigins = [
    'https://siddiqui-jewellers.web.app',
    'https://jewellers-admin-panel.web.app'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({
    limit: '50mb',
    extended: true
}));

// ==========================================
// COMMON ERROR HANDLER
// ==========================================

function handleError(res, error, operation) {
    console.error(operation, error);

    if (error.errorNum === 1) {
        return res.status(409).json({
            success: false,
            message: 'This record already exists.'
        });
    }

    return res.status(500).json({
        success: false,
        message: error.message || 'Database error.'
    });
}

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Oracle production API is running.'
    });
});

// ==========================================
// CUSTOMER ORDERS
// POST - Save Customer Order
// ==========================================

app.post('/api/customer-orders', async (req, res) => {
    try {
        const {
            orderId,
            firstName,
            lastName,
            email,
            phone,
            address,
            city,
            state,
            pincode,
            payment_method,
            products,
            total_price
        } = req.body;

        if (!orderId || !firstName || !email) {
            return res.status(400).json({
                success: false,
                message: 'Order ID, first name and email are required.'
            });
        }

        if (!Array.isArray(products) || products.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please add at least one product.'
            });
        }

        const validProducts = products.every(product =>
            product.product_id !== undefined &&
            product.product_name &&
            Number(product.quantity) > 0 &&
            Number.isFinite(Number(product.unit_price)) &&
            Number(product.unit_price) >= 0
        );

        if (!validProducts) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product details.'
            });
        }

        if (
            !Number.isFinite(Number(total_price)) ||
            Number(total_price) < 0
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid total price.'
            });
        }

        const sql = `
            INSERT INTO customer_orders (
                order_id,
                first_name,
                last_name,
                email,
                phone,
                address,
                city,
                state,
                pincode,
                payment_method,
                products,
                total_price
            )
            VALUES (
                :orderId,
                :firstName,
                :lastName,
                :email,
                :phone,
                :address,
                :city,
                :state,
                :pincode,
                :paymentMethod,
                :products,
                :totalPrice
            )
            RETURNING id INTO :outId
        `;

        const result = await db.execute(sql, {
            orderId,
            firstName,
            lastName: lastName || null,
            email,
            phone: phone || null,
            address: address || null,
            city: city || null,
            state: state || null,
            pincode: pincode || null,
            paymentMethod: payment_method || null,
            products: JSON.stringify(products),
            totalPrice: Number(total_price),
            outId: {
                dir: oracledb.BIND_OUT,
                type: oracledb.NUMBER
            }
        });

        return res.status(201).json({
            success: true,
            message: 'Customer order saved successfully!',
            data: {
                id: result.outBinds.outId[0],
                orderId
            }
        });

    } catch (error) {
        if (error.errorNum === 1) {
            return res.status(409).json({
                success: false,
                message: 'This Order ID already exists.'
            });
        }

        return handleError(res, error, 'POST ORDER ERROR');
    }
});

// ==========================================
// CUSTOMER ORDERS
// GET - Fetch All Orders
// ==========================================

app.get('/api/customer-orders', async (req, res) => {
    try {
        const sql = `
            SELECT
                id AS "id",
                order_id AS "order_id",
                first_name AS "first_name",
                last_name AS "last_name",
                email AS "email",
                phone AS "phone",
                address AS "address",
                city AS "city",
                state AS "state",
                pincode AS "pincode",
                payment_method AS "payment_method",
                products AS "products",
                total_price AS "total_price",
                order_status AS "order_status",
                created_at AS "created_at"
            FROM customer_orders
            ORDER BY id DESC
        `;

        const result = await db.execute(sql);

        return res.status(200).json({
            success: true,
            message: 'Orders fetched successfully!',
            total: result.rows.length,
            data: result.rows
        });

    } catch (error) {
        return handleError(res, error, 'GET ORDERS ERROR');
    }
});

// ==========================================
// CUSTOMER ORDERS
// PUT - Update Order Status
// ==========================================

app.put('/api/customer-orders/:id/status', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { order_status } = req.body;

        const allowedStatuses = [
            'Pending',
            'Processing',
            'Shipped',
            'Delivered',
            'Cancelled'
        ];

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID.'
            });
        }

        if (!allowedStatuses.includes(order_status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order status.'
            });
        }

        const result = await db.execute(`
            UPDATE customer_orders
            SET order_status = :status
            WHERE id = :id
        `, {
            status: order_status,
            id
        });

        if (result.rowsAffected === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Order status updated successfully!',
            data: {
                id,
                order_status
            }
        });

    } catch (error) {
        return handleError(res, error, 'UPDATE ORDER STATUS ERROR');
    }
});

// ==========================================
// PRODUCT INVENTORY
// POST - Add New Product
// ==========================================

app.post('/api/product-inventory', async (req, res) => {
    try {
        const {
            productId,
            stoneName,
            price,
            category,
            reportNo,
            weight,
            shapeCut,
            dimension,
            color,
            refractiveIndex,
            specificGravity,
            speciesGroup,
            hardness,
            comments,
            images
        } = req.body;

        if (
            !productId ||
            !stoneName ||
            !Number.isFinite(Number(price)) ||
            Number(price) <= 0 ||
            !category ||
            !reportNo ||
            !Number.isFinite(Number(weight)) ||
            Number(weight) <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: 'Product ID, stone name, price, category, report number and valid weight are required.'
            });
        }

        if (
            !Array.isArray(images) ||
            images.length === 0 ||
            images.length > 4
        ) {
            return res.status(400).json({
                success: false,
                message: 'Please upload between 1 and 4 images.'
            });
        }

        const sql = `
            INSERT INTO jewellery_products (
                product_id,
                stone_name,
                price,
                category,
                report_no,
                weight,
                shape_cut,
                dimension,
                color,
                refractive_index,
                specific_gravity,
                species_group,
                hardness,
                comments,
                images
            )
            VALUES (
                :productId,
                :stoneName,
                :price,
                :category,
                :reportNo,
                :weight,
                :shapeCut,
                :dimension,
                :color,
                :refractiveIndex,
                :specificGravity,
                :speciesGroup,
                :hardness,
                :comments,
                :images
            )
            RETURNING id INTO :outId
        `;

        const result = await db.execute(sql, {
            productId,
            stoneName: stoneName.trim(),
            price: Number(price),
            category: category.trim(),
            reportNo: reportNo.trim(),
            weight: Number(weight),
            shapeCut: shapeCut || null,
            dimension: dimension || null,
            color: color || null,
            refractiveIndex: refractiveIndex || null,
            specificGravity: specificGravity || null,
            speciesGroup: speciesGroup || null,
            hardness: hardness || null,
            comments: comments || null,
            images: JSON.stringify(images),
            outId: {
                dir: oracledb.BIND_OUT,
                type: oracledb.NUMBER
            }
        });

        return res.status(201).json({
            success: true,
            message: 'Product saved successfully!',
            data: {
                id: result.outBinds.outId[0],
                productId,
                stoneName,
                price,
                category,
                reportNo
            }
        });

    } catch (error) {
        if (error.errorNum === 1) {
            return res.status(409).json({
                success: false,
                message: 'This Product ID or Report Number already exists.'
            });
        }

        return handleError(res, error, 'ADD PRODUCT ERROR');
    }
});

// ==========================================
// PRODUCT INVENTORY
// GET - Fetch All Products
// ==========================================

app.get('/api/product-inventory', async (req, res) => {
    try {
        const sql = `
            SELECT
                id AS "id",
                product_id AS "product_id",
                stone_name AS "stone_name",
                price AS "price",
                category AS "category",
                report_no AS "report_no",
                weight AS "weight",
                shape_cut AS "shape_cut",
                dimension AS "dimension",
                color AS "color",
                refractive_index AS "refractive_index",
                specific_gravity AS "specific_gravity",
                species_group AS "species_group",
                hardness AS "hardness",
                comments AS "comments",
                images AS "images"
            FROM jewellery_products
            ORDER BY id DESC
        `;

        const result = await db.execute(sql);

        const formattedProducts = result.rows.map(product => {
            let productImages = product.images;

            if (typeof productImages === 'string') {
                try {
                    productImages = JSON.parse(productImages);
                } catch (error) {
                    productImages = [];
                }
            }

            if (!Array.isArray(productImages)) {
                productImages = [];
            }

            return {
                id: product.id,
                productId: product.product_id,
                stoneName: product.stone_name,
                price: Number(product.price),
                category: product.category,
                reportNo: product.report_no,
                weight: Number(product.weight),
                shapeCut: product.shape_cut || '',
                dimension: product.dimension || '',
                color: product.color || '',
                refractiveIndex: product.refractive_index || '',
                specificGravity: product.specific_gravity || '',
                speciesGroup: product.species_group || '',
                hardness: product.hardness || '',
                comments: product.comments || '',
                images: productImages
            };
        });

        return res.status(200).json({
            success: true,
            message: 'Products fetched successfully!',
            total: formattedProducts.length,
            data: formattedProducts
        });

    } catch (error) {
        return handleError(res, error, 'GET PRODUCTS ERROR');
    }
});

// ==========================================
// PRODUCT INVENTORY
// PUT - Update Existing Product
// ==========================================

app.put('/api/product-inventory/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);

        const {
            stoneName,
            price,
            category,
            reportNo,
            weight,
            shapeCut,
            dimension,
            color,
            refractiveIndex,
            specificGravity,
            speciesGroup,
            hardness,
            comments,
            images
        } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID.'
            });
        }

        if (
            !stoneName ||
            !stoneName.trim() ||
            !Number.isFinite(Number(price)) ||
            Number(price) <= 0 ||
            !category ||
            !category.trim() ||
            !reportNo ||
            !reportNo.trim() ||
            !Number.isFinite(Number(weight)) ||
            Number(weight) <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: 'Stone name, report number and valid weight are required.'
            });
        }

        if (
            !Array.isArray(images) ||
            images.length === 0 ||
            images.length > 4
        ) {
            return res.status(400).json({
                success: false,
                message: 'Please provide between 1 and 4 images.'
            });
        }

        const sql = `
            UPDATE jewellery_products
            SET
                stone_name = :stoneName,
                price = :price,
                category = :category,
                report_no = :reportNo,
                weight = :weight,
                shape_cut = :shapeCut,
                dimension = :dimension,
                color = :color,
                refractive_index = :refractiveIndex,
                specific_gravity = :specificGravity,
                species_group = :speciesGroup,
                hardness = :hardness,
                comments = :comments,
                images = :images
            WHERE id = :id
        `;

        const result = await db.execute(sql, {
            stoneName: stoneName.trim(),
            price: Number(price),
            category: category.trim(),
            reportNo: reportNo.trim(),
            weight: Number(weight),
            shapeCut: shapeCut || null,
            dimension: dimension || null,
            color: color || null,
            refractiveIndex: refractiveIndex || null,
            specificGravity: specificGravity || null,
            speciesGroup: speciesGroup || null,
            hardness: hardness || null,
            comments: comments || null,
            images: JSON.stringify(images),
            id
        });

        if (result.rowsAffected === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Product updated successfully!',
            data: { id }
        });

    } catch (error) {
        if (error.errorNum === 1) {
            return res.status(409).json({
                success: false,
                message: 'This report number already exists.'
            });
        }

        return handleError(res, error, 'UPDATE PRODUCT ERROR');
    }
});

// ==========================================
// PRODUCT INVENTORY
// DELETE - Delete Product
// ==========================================

app.delete('/api/product-inventory/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID.'
            });
        }

        const result = await db.execute(`
            DELETE FROM jewellery_products
            WHERE id = :id
        `, { id });

        if (result.rowsAffected === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Product deleted successfully!',
            data: { id }
        });

    } catch (error) {
        return handleError(res, error, 'DELETE PRODUCT ERROR');
    }
});

// ==========================================
// NEWSLETTER
// POST - Subscribe
// ==========================================

app.post('/api/newsletter', async (req, res) => {
    try {
        const { email } = req.body;

        if (
            !email ||
            typeof email !== 'string' ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address.'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const existing = await db.execute(`
            SELECT id AS "id"
            FROM newsletter_subscribers
            WHERE email = :email
        `, { email: normalizedEmail });

        if (existing.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'This email is already subscribed!'
            });
        }

        await db.execute(`
            INSERT INTO newsletter_subscribers (email)
            VALUES (:email)
        `, { email: normalizedEmail });

        return res.status(201).json({
            success: true,
            message: 'Thank you for subscribing!'
        });

    } catch (error) {
        if (error.errorNum === 1) {
            return res.status(409).json({
                success: false,
                message: 'This email is already subscribed!'
            });
        }

        return handleError(res, error, 'NEWSLETTER ERROR');
    }
});

// ==========================================
// NEWSLETTER
// GET - Fetch Subscribers
// ==========================================

app.get('/api/newsletter', async (req, res) => {
    try {
        const result = await db.execute(`
            SELECT
                id AS "id",
                email AS "email",
                created_at AS "created_at"
            FROM newsletter_subscribers
            ORDER BY id DESC
        `);

        return res.status(200).json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });

    } catch (error) {
        return handleError(res, error, 'GET NEWSLETTER ERROR');
    }
});

// ==========================================
// SERVER START
// ==========================================

const PORT = process.env.PORT || 2484;

// Standalone hosting: start server.
// Vercel/serverless: export app without app.listen().

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
