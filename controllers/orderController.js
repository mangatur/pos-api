'use strict';
const MongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;
const TimeStamp = require('../base/timeStamp');

let dbo;

module.exports = exports = function (server) {
    //Route POS
    server.post('/:sufix/api/order', verifyToken, (req, res, next) => {
        var sufix = req.params.sufix;
        try {
            MongoClient.connect(config.dbconn, { useNewUrlParser: true }, async function (err, db) {
                if (err) {
                    return next(new Error(err));
                }

                dbo = db.db(config.dbname);

                var header = req.body;

                if (header.payment == undefined) {
                    var error = new Error('Payment is required!');
                    error.status = 404;
                    next(error);
                }

                var details = req.body.orders;

                TimeStamp(header, req);

                delete header.orders;

                if (!header.payment || details.length == 0) {
                    return res.send(500, {
                        error: true,
                        message: 'No payment or no orders found!'
                    });
                }

                header.active = true;

                details.forEach(order => {
                    if (order.productId == undefined || order.quantity == undefined || order.price == undefined) {
                        var error = new Error('ProductId, Price and Quantity are required!');
                        error.status = 404;
                        next(error);
                    }

                    TimeStamp(order, req);
                    order.productId = ObjectID(order.productId);
                    order.active = true;
                });

                GetNewReference(dbo, sufix, resRef => {
                    header.reference = resRef;

                    dbo.collection('orderHeader' + sufix).insert(header, (errHead, resHead) => {
                        if (errHead) {
                            next(errHead);
                        }

                        if (resHead) {
                            details.forEach(order => {
                                order.headerId = header._id;
                            });

                            dbo.collection('orderDetail' + sufix).insertMany(details, (errDet, resDet) => {
                                if (errDet) {
                                    next(errDet);
                                }

                                return res.send(201, {
                                    error: false,
                                    message: 'Save successful',
                                    header: header,
                                    details: resDet
                                });

                            });

                        }
                    });
                });
            });
        } catch (error) {
            return res.send(500, {
                error: true,
                message: error
            });
        }
    });

    // //Route POS
    // server.post('/:sufix/api/orderDet', verifyToken, (req, res, next) => {
    //     var sufix = req.params.sufix;
    //     MongoClient.connect(config.dbconn, async function (err, db) {
    //         if (err) {
    //             return next(new Error(err));
    //         }
    //         dbo = db.db(config.dbname);
    //         GetNewReference(dbo, sufix, response => {
    //             let order = req.body;
    //             order.reference = response;

    //             res.send(201, {
    //                 data: order
    //             });
    //         });
    //     });
    // });

    //Route get Report
    server.get('/:sufix/api/orderreport', verifyToken, (req, res, next) => {
        var sufix = req.params.sufix;
        MongoClient.connect(config.dbconn, async function (err, db) {
            if (err) {
                return next(new Error(err));
            }
            dbo = db.db(config.dbname);

            dbo.collection('orderHeader' + sufix)
                .aggregate([
                    { $lookup: { from: 'orderDetail' + sufix, localField: '_id', foreignField: 'headerId', as: 'details' } },
                    { $unwind: { path: '$details', 'preserveNullAndEmptyArrays': true } },
                    { $lookup: { from: 'product' + sufix, localField: 'details.productId', foreignField: '_id', as: 'details.product' } },
                    { $unwind: { path: '$details.product', 'preserveNullAndEmptyArrays': true } },
                    {
                        $group: {
                            "_id": "$_id",
                            "payment": "$payment",
                            "createDate": { "$first": "$createDate" },
                            "reference": { "$first": "$reference" },
                            "payment": { "$first": "$payment" },
                            "details": { "$push": "$details" }
                        }
                    },
                    {
                        $project: {
                            "details.createDate": 0,
                            "details.modifyDate": 0,
                            "details.active": 0,
                            "details.headerId": 0,
                            "details.productId": 0,
                            "details.product.active": 0,
                        }
                    },
                    {
                        $sort: {
                            "reference": -1
                        }
                    }
                ]).toArray(function (err, response) {
                    if (err) {
                        return next(new Error(err));
                    }

                    res.send(200, response);
                });
        });
    });

    //Route get Report Paging
    server.get('/:sufix/api/orderreport/:pg/:cnt', verifyToken, (req, res, next) => {
        var page = req.params.pg;
        var count = req.params.cnt;
        var sufix = req.params.sufix;
        MongoClient.connect(config.dbconn, async function (err, db) {
            if (err) {
                return next(new Error(err));
            }
            dbo = db.db(config.dbname);

            dbo.collection('orderHeader' + sufix)
                .aggregate([
                    { $lookup: { from: 'orderDetail' + sufix, localField: '_id', foreignField: 'headerId', as: 'details' } },
                    { $unwind: { path: '$details', 'preserveNullAndEmptyArrays': true } },
                    { $lookup: { from: 'product' + sufix, localField: 'details.productId', foreignField: '_id', as: 'details.product' } },
                    { $unwind: { path: '$details.product', 'preserveNullAndEmptyArrays': true } },
                    {
                        $group: {
                            "_id": "$_id",
                            "payment": "$payment",
                            "createDate": { "$first": "$createDate" },
                            "reference": { "$first": "$reference" },
                            "payment": { "$first": "$payment" },
                            "details": { "$push": "$details" },
                            "count": { $sum: 1 }
                        }
                    },
                    {
                        $project: {
                            "details.createDate": 0,
                            "details.modifyDate": 0,
                            "details.active": 0,
                            "details.headerId": 0,
                            "details.productId": 0,
                            "details.product.active": 0,
                        }
                    },
                    {
                        $sort: {
                            "reference": -1
                        }
                    }
                ]).toArray(function (err, response) {
                    if (err) {
                        return next(new Error(err));
                    }

                    res.send(200, response);
                });
        });
    });
}

function GetNewReference(dbo, sufix, callback) {
    var newRef = "SLS-" + new Date().getFullYear().toString().substr(-2) + ("0" + (new Date().getMonth() + 1)).slice(-2) + "-";
    var lastRef = "0001";

    dbo.collection('orderHeader' + sufix).aggregate(
        [
            {
                $match: { "reference": { $regex: ".*" + newRef + ".*" } }
            },
            {
                $group: {
                    _id: null,
                    maxValue: { $max: "$reference" }
                }
            }
        ]
    ).toArray(function (error, response) {
        if (error) {
            return next(new Error(error));
        }

        if (response && response.length > 0) {
            var arr = response[0].maxValue.split("-");
            var inc = parseInt(arr[2]) + 1;
            lastRef = newRef + ("0000" + inc).slice(-4);
            return callback(lastRef);
        } else {
            return callback(newRef + lastRef);
        }
    });
}

// function GetNewReference(dbo, sufix, callback) {
//     var newRef = "SLS-" + new Date().getFullYear().toString().substr(-2) + ("0" + (new Date().getMonth() + 1)).slice(-2) + "-";
//     var lastRef = "0001";

//     dbo.collection('orderHeader' + sufix).aggregate(
//         [
//             {
//                 $match: { "reference": { $regex: ".*" + newRef + ".*" } }
//             },
//             {
//                 $group: {
//                     _id: null,
//                     maxValue: { $max: "$reference" }
//                 }
//             }
//         ]
//     ).toArray(function (error, response) {
//         if (error) {
//             return next(new Error(error));
//         }

//         if (response && response.length > 0) {
//             var arr = response[0].maxValue.split("-");
//             var inc = parseInt(arr[2]) + 1;
//             lastRef = newRef + ("0000" + inc).slice(-4);
//             return callback(lastRef);
//         } else {
//             return callback(newRef + lastRef);
//         }
//     });
// }