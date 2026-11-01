import { Request, Response } from "express";
import { PaymentGW } from "./paymentTypes";
import orderModel from "../order/orderModel";
import { OrderEvents, PaymentStatus } from "../order/orderTypes";
import { MessageBroker } from "../types/broker";
import customerModel from "../customer/customerModel";
import logger from "../config/logger";

export class PaymentController {
  constructor(
    private paymentGw: PaymentGW,
    private broker: MessageBroker,
  ) { }
  handleWebhook = async (req: Request, res: Response) => {
    const webhookBody = req.body;
    logger.info("Received Stripe webhook event", { type: webhookBody.type });

    if (webhookBody.type === "checkout.session.completed") {
      const verifiedSession = await this.paymentGw.getSession(
        webhookBody.data.object.id,
      );

      const isPaymentSuccess = verifiedSession.paymentStatus === "paid";

      const updatedOrder = await orderModel.findOneAndUpdate(
        {
          _id: verifiedSession.metadata.orderId,
        },
        {
          paymentStatus: isPaymentSuccess
            ? PaymentStatus.PAID
            : PaymentStatus.FAILED,
        },
        { new: true },
      );
      const customer = await customerModel.findOne({
        _id: updatedOrder.customerId,
      });
      logger.info("Order payment status updated in database", {
        orderId: updatedOrder._id,
        paymentStatus: updatedOrder.paymentStatus,
      });
      const brokerMessage = {
        event_type: OrderEvents.PAYMENT_STATUS_UPDATE,
        data: {
          ...updatedOrder.toObject(),
          customerId: customer,
        },
      };
      try {
        await this.broker.sendMessage(
          "order",
          JSON.stringify(brokerMessage),
          updatedOrder._id.toString(),
        );
        logger.info("Published payment status update event to broker", {
          orderId: updatedOrder._id,
        });
      } catch (err: any) {
        //The stripe will receive 500 error and do the retry itself for 3 days
        logger.error("Broker message publishing failed", {
          orderId: updatedOrder._id,
          error: err.message,
        });
        throw new Error(`Broker message publishing failed: ${err.message}`);
      }
    }

    return res.json({ success: true });
  };
}
