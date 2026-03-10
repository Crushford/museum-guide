-- Allow the same user to redeem the same promo code twice.
-- Previously this was unique per (promoCodeId, userUid), which capped at one use.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'PromoCodeRedemption'
  ) THEN
    DROP INDEX IF EXISTS "PromoCodeRedemption_promoCodeId_userUid_key";

    CREATE INDEX IF NOT EXISTS "PromoCodeRedemption_promoCodeId_userUid_idx"
      ON "PromoCodeRedemption"("promoCodeId", "userUid");
  END IF;
END $$;
