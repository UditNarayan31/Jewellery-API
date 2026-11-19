
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(cors());


app.use(express.json({ limit: '50mb' }));

app.use(express.urlencoded({
    limit: '50mb',
    extended: true
}));

// ==========================================
// CUSTOMER ORDERS
// POST - Save Customer Order
// ==========================================

app.post('/api/customer-orders', async (req, res) => {
    try {
        console.log('Received Order:', req.body);

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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await db.execute(sql, [
            orderId,
            firstName,
            lastName || null,
            email,
            phone || null,
            address || null,
            city || null,
            state || null,
            pincode || null,
            payment_method || null,
            JSON.stringify(products),
            Number(total_price)
        ]);

        return res.status(201).json({
            success: true,
            message: 'Customer order saved successfully!',
            data: {
                id: result.insertId,
                orderId
            }
        });

    } catch (error) {
        console.error('POST ORDER ERROR:', error);

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'This Order ID already exists.'
            });
        }

        return res.status(500).json({
            success: false,
            message: error.sqlMessage || error.message
        });
    }
});


// ==========================================
// CUSTOMER ORDERS
// GET - Fetch All Customer Orders
// ==========================================

app.get('/api/customer-orders', async (req, res) => {
    try {
        const sql = `
            SELECT
                id,
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
                total_price,
                order_status,
                created_at
            FROM customer_orders
            ORDER BY id DESC
        `;

        const [orders] = await db.execute(sql);

        return res.status(200).json({
            success: true,
            message: 'Orders fetched successfully!',
            total: orders.length,
            data: orders
        });

    } catch (error) {
        console.error('GET ORDERS ERROR:', error);

        return res.status(500).json({
            success: false,
            message: error.sqlMessage || error.message
        });
    }
});


// ==========================================
// CUSTOMER ORDERS
// PUT - Update Customer Order Status
// ==========================================

app.put('/api/customer-orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { order_status } = req.body;

        const allowedStatuses = [
            'Pending',
            'Processing',
            'Shipped',
            'Delivered',
            'Cancelled'
        ];

        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
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

        const sql = `
            UPDATE customer_orders
            SET order_status = ?
            WHERE id = ?
        `;

        const [result] = await db.execute(sql, [
            order_status,
            Number(id)
        ]);

        if (result.affectedRows === 0) {
            const [existingOrder] = await db.execute(
                'SELECT id FROM customer_orders WHERE id = ?',
                [Number(id)]
            );

            if (existingOrder.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found.'
                });
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Order status updated successfully!',
            data: {
                id: Number(id),
                order_status
            }
        });

    } catch (error) {
        console.error('UPDATE ORDER STATUS ERROR:', error);

        return res.status(500).json({
            success: false,
            message: error.sqlMessage || error.message
        });
    }
});


// ==========================================
// PRODUCT INVENTORY
// POST - Add New Product
// ==========================================

app.post('/api/product-inventory', async (req, res) => {
    try {
        console.log('Received Product:', req.body);

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

        // Required field validation

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

        // Image validation

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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            productId,
            stoneName.trim(),
            Number(price),
            category.trim(),
            reportNo.trim(),
            Number(weight),
            shapeCut || null,
            dimension || null,
            color || null,
            refractiveIndex || null,
            specificGravity || null,
            speciesGroup || null,
            hardness || null,
            comments || null,
            JSON.stringify(images)
        ];

        const [result] = await db.execute(sql, values);

        return res.status(201).json({
            success: true,
            message: 'Product saved successfully!',
            data: {
                id: result.insertId,
                productId,
                stoneName,
                price,
                category,
                reportNo
            }
        });

    } catch (error) {
        console.error('ADD PRODUCT ERROR:', error);

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'This Product ID or Report Number already exists.'
            });
        }

        return res.status(500).json({
            success: false,
            message: error.sqlMessage || error.message
        });
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
                id,
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
            FROM jewellery_products
            ORDER BY id DESC
        `;

        const [products] = await db.execute(sql);

        const formattedProducts = products.map(product => {
            let productImages = product.images;

            if (typeof productImages === 'string') {
                try {
                    productImages = JSON.parse(productImages);
                } catch (error) {
                    console.error(
                        'IMAGE JSON PARSE ERROR:',
                        error
                    );

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
        console.error('GET PRODUCTS ERROR:', error);

        return res.status(500).json({
            success: false,
            message: error.sqlMessage || error.message
        });
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

        // Validate database ID

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID.'
            });
        }

        // Validate required fields

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

        // Validate images

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
                stone_name = ?,
                price = ?,
                category = ?,
                report_no = ?,
                weight = ?,
                shape_cut = ?,
                dimension = ?,
                color = ?,
                refractive_index = ?,
                specific_gravity = ?,
                species_group = ?,
                hardness = ?,
                comments = ?,
                images = ?
            WHERE id = ?
        `;

        const values = [
            stoneName.trim(),
            Number(price),
            category.trim(),
            reportNo.trim(),
            Number(weight),
            shapeCut || null,
            dimension || null,
            color || null,
            refractiveIndex || null,
            specificGravity || null,
            speciesGroup || null,
            hardness || null,
            comments || null,
            JSON.stringify(images),
            id
        ];

        const [result] = await db.execute(sql, values);

        // Check if product exists

        if (result.affectedRows === 0) {
            const [existingProduct] = await db.execute(
                'SELECT id FROM jewellery_products WHERE id = ?',
                [id]
            );

            if (existingProduct.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Product not found.'
                });
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Product updated successfully!',
            data: {
                id
            }
        });

    } catch (error) {
        console.error('UPDATE PRODUCT ERROR:', error);

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'This report number already exists.'
            });
        }

        return res.status(500).json({
            success: false,
            message: error.sqlMessage || error.message
        });
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

        const sql = `
            DELETE FROM jewellery_products
            WHERE id = ?
        `;

        const [result] = await db.execute(sql, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Product deleted successfully!',
            data: {
                id
            }
        });

    } catch (error) {
        console.error('DELETE PRODUCT ERROR:', error);

        return res.status(500).json({
            success: false,
            message: error.sqlMessage || error.message
        });
    }
});


// ==========================================
// POST API - Newsletter Subscription
// ==========================================
app.post("/api/newsletter", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [existing] = await db.execute(
      "SELECT id FROM newsletter_subscribers WHERE email = ?",
      [normalizedEmail]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This email is already subscribed!",
      });
    }

    await db.execute(
      "INSERT INTO newsletter_subscribers (email) VALUES (?)",
      [normalizedEmail]
    );

    return res.status(201).json({
      success: true,
      message: "Thank you for subscribing!",
    });
  } catch (error) {
    console.error("NEWSLETTER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to subscribe. Please try again later.",
    });
  }
});

// ==========================================
// GET API - Fetch Newsletter Subscribers
// ==========================================
app.get("/api/newsletter", async (req, res) => {
  console.log("GET NEWSLETTER API CALLED");

  try {
    const [subscribers] = await db.execute(
      `SELECT id, email, created_at
       FROM newsletter_subscribers
       ORDER BY id DESC`
    );

    return res.status(200).json({
      success: true,
      count: subscribers.length,
      data: subscribers,
    });

  } catch (error) {
    console.error("GET NEWSLETTER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});


// ==========================================
// SERVER START
// ==========================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
