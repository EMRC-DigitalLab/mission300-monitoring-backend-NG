-- Projects from the NISO register carry no projected completion date.
-- A placeholder date would read as a real delivery commitment, so the
-- column becomes nullable instead.
ALTER TABLE "projects" ALTER COLUMN "endDate" DROP NOT NULL;
