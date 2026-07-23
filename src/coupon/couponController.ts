import { NextFunction, Request, Response } from "express";
import { Request as AuthRequest } from "express-jwt";
import couponModel from "./couponModel";
import createHttpError from "http-errors";
import { ROLES } from "../types";

export class CouponController {
  create = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { title, code, validUpto, discount, tenantId } = req.body;
    const { role, tenant: userTenantId } = req.auth;

    if (role === ROLES.CUSTOMER) {
      return next(createHttpError(403, "Not allowed."));
    }

    if (role === ROLES.MANAGER && Number(tenantId) !== userTenantId) {
      return next(createHttpError(403, "Not allowed to create coupon for another tenant."));
    }

    try {
      // Check if coupon with the same code already exists for the tenant
      const existingCoupon = await couponModel.findOne({ tenantId: Number(tenantId), code });
      if (existingCoupon) {
        return next(createHttpError(400, "Coupon code already exists for this boutique."));
      }

      const coupon = await couponModel.create({
        title,
        code,
        discount: Number(discount),
        validUpto: new Date(validUpto),
        tenantId: Number(tenantId),
      });

      return res.json(coupon);
    } catch (error) {
      return next(error);
    }
  };

  getAll = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { role, tenant: userTenantId } = req.auth;

    if (role === ROLES.CUSTOMER) {
      return next(createHttpError(403, "Not allowed."));
    }

    const tenantId = req.query.tenantId;
    const filter = {};

    if (role === ROLES.ADMIN) {
      if (tenantId) {
        filter["tenantId"] = Number(tenantId);
      }
    } else if (role === ROLES.MANAGER) {
      filter["tenantId"] = userTenantId;
    }

    try {
      const coupons = await couponModel.find(filter).sort({ createdAt: -1 });
      return res.json(coupons);
    } catch (error) {
      return next(error);
    }
  };

  getOne = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { role, tenant: userTenantId } = req.auth;

    if (role === ROLES.CUSTOMER) {
      return next(createHttpError(403, "Not allowed."));
    }

    try {
      const coupon = await couponModel.findById(id);
      if (!coupon) {
        return next(createHttpError(404, "Coupon not found."));
      }

      if (role === ROLES.MANAGER && coupon.tenantId !== userTenantId) {
        return next(createHttpError(403, "Not allowed to view this coupon."));
      }

      return res.json(coupon);
    } catch (error) {
      return next(error);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { title, code, validUpto, discount, tenantId } = req.body;
    const { role, tenant: userTenantId } = req.auth;

    if (role === ROLES.CUSTOMER) {
      return next(createHttpError(403, "Not allowed."));
    }

    try {
      const coupon = await couponModel.findById(id);
      if (!coupon) {
        return next(createHttpError(404, "Coupon not found."));
      }

      if (role === ROLES.MANAGER && coupon.tenantId !== userTenantId) {
        return next(createHttpError(403, "Not allowed to update this coupon."));
      }

      if (role === ROLES.MANAGER && tenantId && Number(tenantId) !== userTenantId) {
        return next(createHttpError(403, "Not allowed to change coupon's tenant to another tenant."));
      }

      // Check if another coupon has the same code for the target tenant
      const targetTenantId = tenantId ? Number(tenantId) : coupon.tenantId;
      if (code) {
        const existingCoupon = await couponModel.findOne({
          _id: { $ne: id },
          tenantId: targetTenantId,
          code
        });
        if (existingCoupon) {
          return next(createHttpError(400, "Another coupon already uses this code for this boutique."));
        }
      }

      if (title !== undefined) coupon.title = title;
      if (code !== undefined) coupon.code = code;
      if (validUpto !== undefined) coupon.validUpto = new Date(validUpto);
      if (discount !== undefined) coupon.discount = Number(discount);
      if (tenantId !== undefined) coupon.tenantId = Number(tenantId);

      await coupon.save();
      return res.json(coupon);
    } catch (error) {
      return next(error);
    }
  };

  delete = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { role, tenant: userTenantId } = req.auth;

    if (role === ROLES.CUSTOMER) {
      return next(createHttpError(403, "Not allowed."));
    }

    try {
      const coupon = await couponModel.findById(id);
      if (!coupon) {
        return next(createHttpError(404, "Coupon not found."));
      }

      if (role === ROLES.MANAGER && coupon.tenantId !== userTenantId) {
        return next(createHttpError(403, "Not allowed to delete this coupon."));
      }

      await couponModel.deleteOne({ _id: id });
      return res.json({ id });
    } catch (error) {
      return next(error);
    }
  };

  verify = async (req: Request, res: Response, next: NextFunction) => {
    const { code, tenantId } = req.body;

    const coupon = await couponModel.findOne({ code, tenantId });

    if (!coupon) {
      const error = createHttpError(400, "Coupon does not exists");
      return next(error);
    }

    // validate expiry
    const currentDate = new Date();
    const couponDate = new Date(coupon.validUpto);

    if (currentDate <= couponDate) {
      return res.json({ valid: true, discount: coupon.discount });
    }

    return res.json({ valid: false, discount: 0 });
  };
}
