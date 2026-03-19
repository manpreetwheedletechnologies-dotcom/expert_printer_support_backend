const mongoose = require('mongoose');

const cmsSchema = new mongoose.Schema(
  {
    slug:  { type: String, required: true, unique: true, lowercase: true },
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ['page', 'faq', 'banner', 'service', 'testimonial', 'announcement'],
      required: true,
    },

    // Page content (flexible sections)
    content: {
      hero: {
        heading:    String,
        subheading: String,
        imageUrl:   String,
        ctaText:    String,
        ctaLink:    String,
      },
      body: { type: String },          // Rich text / HTML
      sections: [
        {
          title:   String,
          text:    String,
          imageUrl: String,
          order:   Number,
        },
      ],
    },

    // FAQ specific
    faqs: [
      {
        question: { type: String },
        answer:   { type: String },
        order:    { type: Number, default: 0 },
      },
    ],

    // SEO
    seo: {
      metaTitle:       String,
      metaDescription: String,
      keywords:        [String],
    },

    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date },
    order: { type: Number, default: 0 },
    lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

cmsSchema.index({ slug: 1, isPublished: 1 });
cmsSchema.index({ type: 1, isPublished: 1 });

module.exports = mongoose.model('CMS', cmsSchema);
