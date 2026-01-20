import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    accountAssociation: {
      header: "eyJmaWQiOjg1NzMsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHg1Mjk0MjMzMTViMTVEQTk2OTFBYkM1QjdjMWNiMEQwNDUwOUIyMmIwIn0",
      payload: "eyJkb21haW4iOiJhcmJtZS5lcGljZHlsYW4uY29tIn0",
      signature: "jj5/abViEfDDlZ8R3d/AkrX/DfG1T6hrwCTfE2zyWSFLmmGvuwRylt5OUc4ndbwI4eQ9xjAlL3Y7TFsEELUjExw="
    },
    miniapp: {
      version: "1",
      name: "ArbMe",
      iconUrl: "https://arbme.epicdylan.com/arbie.png",
      homeUrl: "https://arbme.epicdylan.com/app",
      imageUrl: "https://arbme.epicdylan.com/share-image.png",
      splashImageUrl: "https://arbme.epicdylan.com/arbie.png",
      splashBackgroundColor: "#0a0a0f",
      buttonTitle: "View Pools",
      subtitle: "Permissionless Arb Routes",
      description: "An ERC20 token that pairs with other tokens to create arb routes. LP to earn fees, arb to profit.",
      websiteUrl: "https://arbme.epicdylan.com",
    }
  })
}
